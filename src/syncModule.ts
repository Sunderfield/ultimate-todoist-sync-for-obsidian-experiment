import type AnotherSimpleTodoistSync from "../main";
import type { App, Editor, TAbstractFile } from "obsidian";
import { TFile, MarkdownView, Notice } from "obsidian";
import type { TodoistEvent } from "./todoistAPI";
import type { Task } from "./cacheOperation";
export class TodoistSync {
	app: App;
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		this.app = app;
		this.plugin = plugin;
	}

	// Check if the file has "tasks" without links
	checkForTasksWithoutLink() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const currentFileValue = view?.data;
		const regexTags = /#tdsync/gm;
		const regexLinks =
			/%% \[tid::\(\d+\)\[(?:https:\/\/app.todoist.com\/app\/task\/[a-zA-Z0-9]+|todoist:\/\/task\?id=[a-zA-Z0-9]+)\]%%/g;

		const countTags = currentFileValue?.match(regexTags);
		const countLinks = currentFileValue?.match(regexLinks);

		if (countLinks?.length === countTags?.length) {
			return false;
		}
		return true;
	}

	async deletedTaskCheck(file_path: string): Promise<void> {
		const hasEmptyTasks = this.checkForTasksWithoutLink();
		if (hasEmptyTasks) {
			return;
		}

		let file: TAbstractFile | null;
		let currentFileValue: string | null;
		let view: MarkdownView | null;
		let filepath: string | null;

		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path);
			filepath = file_path;
			// Check if the returned file is a TFile
			if (file instanceof TFile) {
				currentFileValue = await this.app.vault.read(file);
			} else {
				return;
			}
		} else {
			view = this.app.workspace.getActiveViewOfType(MarkdownView);
			//const editor = this.app.workspace.activeEditor?.editor
			file = this.app.workspace.getActiveFile();
			filepath = file?.path ?? null;
			//Use view.data instead of vault.read. vault.read has a delay
			currentFileValue = view?.data ?? null;
		}

		// const frontMatter = await this.plugin.fileOperation?.getFrontMatter(file);
		if (!filepath) {
			console.error("File path is undefined");
			return;
		}
		const frontMatter =
			await this.plugin.cacheOperation?.getFileMetadataByFilePath(filepath);

		if (!frontMatter || !frontMatter.todoistTasks) {
			return;
		}

		// Get all file content, removing the frontmatter (metadata)
		const currentFileValueWithOutFrontMatter = currentFileValue?.replace(
			/^---[\s\S]*?---\n/,
			"",
		);
		const frontMatter_todoistTasks = frontMatter.todoistTasks;
		const frontMatter_todoistCount = frontMatter.todoistCount;

		// Circle through the tasks on the frontmatter, if the current file doesn't include it, move to deletion phase
		const deleteTasksPromises = frontMatter_todoistTasks
			.filter(
				(taskId: string) =>
					!currentFileValueWithOutFrontMatter?.includes(taskId),
			)
			.map(async (taskId: string) => {
				// If the taskId was not found within the file, delete it.
				if (!currentFileValueWithOutFrontMatter?.includes(taskId)) {
					try {
						const api = this.plugin.todoistNewAPI?.initializeNewAPI();
						if (!api) {
							console.error("Failed to initialize Todoist API");
							new Notice("Failed to initialize Todoist API");
							return;
						}
						const response = await api.deleteTask(taskId);

						if (response) {
							new Notice(`Task ${taskId} was deleted`);
							return taskId; // 返回被删除的任务 ID
						}
					} catch (error) {
						console.error(`Failed to delete task ${taskId}: ${error}`);
					}
				}
			});

		const deletedTaskIds = await Promise.all(deleteTasksPromises);
		const deletedTaskAmount = deletedTaskIds.length;
		if (!deletedTaskIds.length) {
			return;
		}
		// Filter out undefined values and convert to string[]
		const validDeletedTaskIds = deletedTaskIds.filter(
			(id): id is string => id !== undefined,
		);
		this.plugin.cacheOperation?.deleteTaskFromCacheByIDs(validDeletedTaskIds);
		this.plugin.saveSettings();
		// Update newFrontMatter_todoistTasks array
		// Disable automatic merging
		const newFrontMatter_todoistTasks = frontMatter_todoistTasks.filter(
			(taskId: string) => !deletedTaskIds.includes(taskId),
		);
		const newFileMetadata = {
			todoistTasks: newFrontMatter_todoistTasks,
			todoistCount: frontMatter_todoistCount - deletedTaskAmount,
		};
		await this.updateTodoistFrontMatter(
			filepath,
			newFileMetadata.todoistTasks,
			newFileMetadata.todoistCount,
		);
	}

	private async updateTodoistFrontMatter(filepath: string, todoistTasks: string[], todoistCount: number) {
		await this.plugin.cacheOperation?.updateFileMetadata(filepath, {
			todoistTasks,
			todoistCount,
		});
	}

	async lineContentNewTaskCheck(
		editor: Editor,
		view: MarkdownView,
	): Promise<void> {
		const filepath = view.file?.path;
		const fileContent = view?.data;
		const cursor = editor.getCursor();
		const line = cursor.line;
		const currentLineText = editor.getLine(line);

		if (!filepath) {
			console.error("File path is undefined");
			return;
		}

		//添加task
		if (
			!this.plugin.taskParser?.hasTodoistId(currentLineText) &&
			this.plugin.taskParser?.hasTodoistTag(currentLineText)
		) {
			//是否包含#todoist

			const currentTask =
				await this.plugin.taskParser?.convertTextToTodoistTaskObject(
					currentLineText,
					filepath,
					line,
					fileContent,
				);

			try {
				const newTask = await this.plugin.todoistNewAPI?.addTask({
					project_id: currentTask.project_id ?? "",
					content: currentTask.content,
					parent_id: currentTask.parent_id ?? undefined,
					due_date: currentTask.due_date ?? undefined,
					due_datetime: currentTask.due_datetime ?? undefined,
					labels: currentTask.labels,
					description: currentTask.description,
					priority: currentTask.priority,
					section_id: currentTask.section_id ?? undefined,
					path: currentTask.path,
					duration: typeof currentTask.duration === "number" ? currentTask.duration : 0,
					duration_unit: currentTask.duration_unit ?? "minute",
					...(currentTask.deadline_date ? { deadline_date: currentTask.deadline_date } : {}),
				});
				if (!newTask) {
					console.error("Failed to add new task");
					return;
				}
				const todoist_id = newTask?.id;
				if (!todoist_id) {
					console.error("Failed to get task ID");
					return;
				}
				(newTask as { path?: string }).path = filepath;
				new Notice(
					`New task "${newTask.content}" added. Task ID: ${newTask.id}`,
				);
				//newTask写入缓存
				this.plugin.cacheOperation?.appendTaskToCache(
					newTask as unknown as Task,
				);
				this.plugin.cacheOperation?.appendPathToTaskInCache(
					todoist_id,
					filepath,
				);

				//如果任务已完成
				if (currentTask.isCompleted === true) {
					await this.plugin.todoistNewAPI?.closeTask(newTask.id);
					this.plugin.cacheOperation?.closeTaskToCacheByID(todoist_id);
				}
				this.plugin.saveSettings();

				//todoist id 保存到 任务后面
				const text_with_out_link = `${currentLineText}`;
				let link: string;
				if (this.plugin.settings.linksAppURI) {
					link = `%%[tid:: [${todoist_id}](todoist://task?id=${newTask.id})]%%`;
				} else {
					// link = `%%[tid:: [${todoist_id}](${newTask.url})]%%`;
					link = `%%[tid:: [${todoist_id}](https://app.todoist.com/app/task/${todoist_id})]%%`;
				}
				const text = this.plugin.taskParser?.addTodoistLink(
					text_with_out_link,
					link,
				);
				const from = { line: cursor.line, ch: 0 };
				const to = { line: cursor.line, ch: currentLineText.length };
				view.app.workspace.activeEditor?.editor?.replaceRange(text, from, to);

				// Handle frontMatter
				try {
					// Handle front matter
					const frontMatter =
						await this.plugin.cacheOperation?.getFileMetadataByFilePath(filepath);
					const newFrontMatter = { ...frontMatter };
					newFrontMatter.todoistCount = (newFrontMatter.todoistCount ?? 0) + 1;
					newFrontMatter.todoistTasks = [
						...(newFrontMatter.todoistTasks || []),
						todoist_id,
					];
					await this.updateTodoistFrontMatter(
						filepath,
						newFrontMatter.todoistTasks,
						newFrontMatter.todoistCount,
					);
				} catch (error) {
					console.error(error);
				}
			} catch (error) {
				console.error(`Error adding task in the file ${filepath}:`, error);
				return;
			}
		}
	}

	async fullTextNewTaskCheck(file_path: string): Promise<void> {
		let file: TAbstractFile | null;
		let currentFileValue: string | null;
		let view: MarkdownView | null;
		let filepath: string | null;

		if (file_path) {
			file = this.app.vault.getAbstractFileByPath(file_path);
			filepath = file_path;
			// currentFileValue = await this.app.vault.read(file)

			// Check if the returned file is a TFile
			if (file instanceof TFile) {
				currentFileValue = await this.app.vault.read(file);
			} else {
				return;
			}
		} else {
			view = this.app.workspace.getActiveViewOfType(MarkdownView);
			//const editor = this.app.workspace.activeEditor?.editor
			file = this.app.workspace.getActiveFile();
			filepath = file?.path ?? null;
			//Use view.data instead of vault.read. vault.read has a delay
			currentFileValue = view?.data ?? null;
		}

		if (!filepath) {
			console.error("File path is undefined");
			new Notice("File path is undefined");
			return;
		}

		if (this.plugin.settings.enableFullVaultSync) {
			await this.plugin.fileOperation?.addTodoistTagToFile(filepath);
		}

		const content = currentFileValue;

		let newFrontMatter: { todoistTasks: string[]; todoistCount: number } = {
			todoistTasks: [],
			todoistCount: 0,
		};
		//frontMatter
		const frontMatter =
			await this.plugin.cacheOperation?.getFileMetadataByFilePath(filepath);

		if (!frontMatter) {
			newFrontMatter = { todoistTasks: [], todoistCount: 0 };
		} else {
			newFrontMatter = { ...frontMatter };
		}

		if (!content) {
			return;
		}

		let hasNewTask = false;
		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				!this.plugin.taskParser?.hasTodoistId(line) &&
				this.plugin.taskParser?.hasTodoistTag(line)
			) {
				const currentTask =
					await this.plugin.taskParser?.convertTextToTodoistTaskObject(
						line,
						filepath,
						i,
						content,
					);
				if (typeof currentTask === "undefined") {
					continue;
				}

				try {
					const newTask = await this.plugin.todoistNewAPI?.addTask({
						project_id: currentTask.project_id ?? "",
						content: currentTask.content,
						parent_id: currentTask.parent_id ?? undefined,
						due_date: currentTask.due_date ?? undefined,
						due_datetime: currentTask.due_datetime ?? undefined,
						labels: currentTask.labels,
						description: currentTask.description,
						priority: currentTask.priority,
						section_id: currentTask.section_id ?? undefined,
						path: currentTask.path,
						duration: typeof currentTask.duration === "number"
							? currentTask.duration
							: (currentTask.duration?.amount ?? 0),
						duration_unit: currentTask.duration_unit ?? "minute",
						...(currentTask.deadline_date ? { deadline_date: currentTask.deadline_date } : {}),
					});

					const todoist_id = newTask?.id;
					if (!todoist_id) {
						console.error("Failed to get task ID");
						return;
					}
					if (!newTask) {
						console.error("Failed to add new task");
						new Notice("Failed to add new task");
						return;
					}

					new Notice(
						`New task "${newTask.content}" added. Task ID: ${newTask.id}`,
					);
					//newTask写入json文件
					this.plugin.cacheOperation?.appendTaskToCache(
						newTask as unknown as Task,
					);
					this.plugin.cacheOperation?.appendPathToTaskInCache(
						todoist_id,
						filepath,
					);

					//如果任务已完成
					if (currentTask.isCompleted === true) {
						await this.plugin.todoistNewAPI?.closeTask(newTask.id);
						this.plugin.cacheOperation?.closeTaskToCacheByID(todoist_id ?? "");
					}
					this.plugin.saveSettings();

					//todoist id 保存到 任务后面
					const text_with_out_link = `${line}`;
					let link: string;
					if (this.plugin.settings.linksAppURI) {
						link = `%%[tid:: [${todoist_id}](todoist://task?id=${newTask.id})]%%`;
					} else {
						link = `%%[tid:: [${todoist_id}](https://app.todoist.com/app/task/${todoist_id})]%%`;
					}
					const text = this.plugin.taskParser?.addTodoistLink(
						text_with_out_link,
						link,
					);
					lines[i] = text;

					newFrontMatter.todoistCount = (newFrontMatter.todoistCount ?? 0) + 1;

					// 记录 taskID
					newFrontMatter.todoistTasks = [
						...(newFrontMatter.todoistTasks || []),
						todoist_id,
					];

					hasNewTask = true;
				} catch (error) {
					console.error("Error adding task:", error);
				}
			}
		}
		if (hasNewTask) {
			//文本和 frontMatter
			try {
				const newContent = lines.join("\n");
				if (file && file instanceof TFile) {
					await this.app.vault.modify(file, newContent);
				}
				await this.updateTodoistFrontMatter(
					filepath,
					newFrontMatter.todoistTasks,
					newFrontMatter.todoistCount,
				);
			} catch (error) {
				console.error(error);
			}
		}
	}

	// Compare the content of the task in the file with the content of the task in the cache to see if they are in sync
	async lineModifiedTaskCheck(
		filepath: string,
		lineText: string,
		lineNumber: number,
		fileContent: string,
	): Promise<void> {
		//const lineText = await this.plugin.fileOperation?.getLineTextFromFilePath(filepath,lineNumber)

		if (this.plugin.settings.enableFullVaultSync) {
			//await this.plugin.fileOperation?.addTodoistTagToLine(filepath,lineText,lineNumber,fileContent)

			//new empty metadata
			const metadata =
				await this.plugin.cacheOperation?.getFileMetadataByFilePath(filepath);
			if (!metadata) {
				await this.plugin.cacheOperation?.newEmptyFileMetadata(filepath);
			}
			this.plugin.saveSettings();
		}

		//检查task
		if (
			this.plugin.taskParser?.hasTodoistId(lineText) &&
			this.plugin.taskParser?.hasTodoistTag(lineText)
		) {
			const lineTask =
				await this.plugin.taskParser?.convertTextToTodoistTaskObject(
					lineText,
					filepath,
					lineNumber,
					fileContent,
				);

			const lineTask_todoist_id = lineTask.id;
			let savedTask =
				this.plugin.cacheOperation?.loadTaskFromCacheID(lineTask_todoist_id);

			const isOldTaskId = this.plugin.cacheOperation?.checkTaskIdIsOld(
				lineTask.id,
			);

			if (isOldTaskId) {
				if (this.plugin.settings.debugMode) {
					console.warn(
						`Task id is using old format (${lineTask.id}), it will ignore this task and not look for any updates.`,
					);
				}
				return;
			}

			if (!savedTask) {
				return;
			}

			//检查内容是否修改
			const lineTaskContent = lineTask.content;

			//content 是否修改
			// The content is compared and inverts the value received
			const contentModified = !this.plugin.taskParser?.taskContentCompare(
				lineTask,
				savedTask,
			);

			//tag or labels 是否修改
			const tagsModified = !this.plugin.taskParser?.taskTagCompare(
				{ labels: lineTask.labels ?? [] },
				{ labels: savedTask.labels ?? [] },
			);
			//Compare project id from the lineTask and savedTask, invert the value received
			const projectModified =
				!(await this.plugin.taskParser?.taskProjectCompare(
					lineTask.project_id ?? "",
					savedTask.project_id ?? "",
				));

			//status 是否修改
			const statusModified = !this.plugin.taskParser?.taskStatusCompare(
				{ isCompleted: lineTask.isCompleted ?? false },
				{ isCompleted: savedTask.isCompleted ?? false },
			);

			const deadlineModified = !(await this.plugin.taskParser?.taskDeadlineCompare(
				{ deadline_date: lineTask.deadline_date ?? "" },
				{ deadline_date: savedTask.deadline?.date ?? "" },
			));

			let dueDateModified = false;
			// let dueDateTimeModified = false;
			let dueTimeModified = false;

			const hasDueDate = this.plugin.taskParser?.hasDueDate(lineText);
			const hasDueTime = this.plugin.taskParser?.hasDueTime(lineText);

			if (hasDueDate && !hasDueTime) {
				// Check if the dueDate was modified
				dueDateModified = !(await this.plugin.taskParser?.compareTaskDueDate(
					lineTask.due_date ?? "",
					savedTask.due?.date ?? "",
				));
			}
			if (hasDueTime && !hasDueDate) {
				// Check if the dueTime was modified
				dueTimeModified = !(await this.plugin.taskParser?.compareTaskDueTime(
					lineTask.due_datetime ?? "",
					savedTask.due?.date ?? "",
				));
			}
			if (hasDueDate && hasDueTime) {
				// Check if the dueDateTime was modified
				dueDateModified = !(await this.plugin.taskParser?.compareTaskDueDate(
					lineTask.due_datetime ?? "",
					savedTask.due?.date ?? "",
				));
				dueTimeModified = !(await this.plugin.taskParser?.compareTaskDueTime(
					lineTask.due_datetime ?? "",
					savedTask.due?.date ?? "",
				));
				if (dueDateModified && dueTimeModified) {
					// dueDateTimeModified = true;
				}
				if (dueDateModified && !dueTimeModified) {
					// dueDateTimeModified = false;
					dueDateModified = true;
					dueTimeModified = false;
				}
				if (!dueDateModified && dueTimeModified) {
					// dueDateTimeModified = false;
					dueDateModified = false;
					dueTimeModified = true;
				}
			}

			

			//parent id 是否修改
			const parentIdModified = !(lineTask.parent_id === savedTask.parent_id);
			//check priority
			// TODO priority is always returning 1 when should be false
			const priorityModified = !(lineTask.priority === savedTask.priority);
			// check if the reminder time has changed
			// check if the duration time has changed
			// will return true or false depending on the finding
			const durationTimeModified =
				await this.plugin.taskParser?.compareTaskDuration(
					typeof lineTask.duration === "number"
						? lineTask.duration
						: lineTask.duration?.amount ?? undefined,
					(typeof savedTask.duration === "object" && savedTask.duration !== null)
						? savedTask.duration
						: undefined,
				);
			// Using the sectionId, compares the name of both sections. Returns true if they are different
			const sectionModified = await this.plugin.taskParser?.compareSection(
				{ sectionId: lineTask.section_id ?? "" },
				{ sectionId: savedTask.section_id ?? "" },
			);

			try {
				let contentChanged = false;
				let tagsChanged = false;
				const projectChanged = false;
				let statusChanged = false;
				let dueDateChanged = false;
				let dueDateTimeChanged = false;
				let dueTimeChanged = false;
				const parentIdChanged = false;
				let priorityChanged = false;
				let durationChanged = false;
				let sectionChanged = false;
				let deadlineChanged = false;

				const updatedContent: {
					content?: string;
					labels?: string[];
					due_string?: string;
					due_date?: string;
					due_datetime?: string;
					project_id?: string;
					parent_id?: string;
					priority?: number;
					duration?: number;
					duration_unit?: string;
					path?: string;
					section_id?: string;
					deadline_date?: string;
				} = {};

				if (contentModified) {
					updatedContent.content = lineTaskContent;
					contentChanged = true;
				}

				if (tagsModified) {
					updatedContent.labels = lineTask.labels;
					tagsChanged = true;
				}

				if (dueDateModified && dueTimeModified) {
					updatedContent.due_datetime = lineTask.due_datetime;
					updatedContent.due_date = lineTask.due_date;
					updatedContent.due_string = "";
					dueDateTimeChanged = true;
					dueDateChanged = true;
					dueTimeChanged = true;
				}

				if (dueDateModified && !dueTimeModified && !hasDueTime) {
					updatedContent.due_date = lineTask.due_date;
					dueDateChanged = true;
					dueTimeChanged = false;
					dueDateTimeChanged = false;
				}
				if (dueDateModified && !dueTimeModified && hasDueTime) {
					updatedContent.due_datetime = lineTask.due_datetime;
					dueDateChanged = true;
					dueTimeChanged = false;
					dueDateTimeChanged = true;
				}
				if (!dueDateModified && dueTimeModified) {
					updatedContent.due_datetime = lineTask.due_datetime;
					dueDateChanged = false;
					dueTimeChanged = true;
					dueDateTimeChanged = true;
				}

				if (durationTimeModified) {
					// Only set duration if both amount and unit are defined
					const duration = lineTask.duration;
					if (typeof duration === "number") {
						updatedContent.duration = duration;
						durationChanged = true;
					}
					if (typeof duration !== "number") {
						updatedContent.duration = undefined;
						durationChanged = false;
					}
				}

				//todoist Rest api 没有 move task to new project的功能
				if (projectModified) {
					//updatedContent.projectId = lineTask.projectId
					//projectChanged = false;
				}

				//todoist Rest api 没有修改 parent id 的借口
				if (parentIdModified) {
					//updatedContent.parentId = lineTask.parentId
					//parentIdChanged = false;
				}

				if (priorityModified) {
					updatedContent.priority = lineTask.priority;
					priorityChanged = true;
				}

				// If the section was modified, it moves the task to the new section and update the cache
				if (sectionModified) {
					this.plugin.todoistNewAPI?.moveTaskToAnotherSection(
						lineTask.id,
						lineTask.section_id ?? "",
					);
					this.plugin.cacheOperation?.updateTaskSectionOnCacheById(
						lineTask.id,
						lineTask.section_id ?? "",
					);
					sectionChanged = true;
					new Notice(`Task ${lineTask.id} moved to ${lineTask.section_id}.`);
				}

				if (deadlineModified) {
					updatedContent.deadline_date = lineTask.deadline_date;
					deadlineChanged = true;
				}

				if (
					this.plugin.settings.debugMode &&
					(contentChanged ||
						tagsChanged ||
						dueDateChanged ||
						dueDateTimeChanged ||
						dueTimeChanged ||
						projectChanged ||
						parentIdChanged ||
						priorityChanged ||
						durationChanged ||
						sectionChanged ||
						deadlineChanged)
				) {
					console.log(
						"Task change status: task id:",
						lineTask.id,
						" on line:",
						lineNumber,
						" from filepath:",
						filepath,
						"contentChanged is:",
						contentChanged,
						"tagsChanged is:",
						tagsChanged,
						"dueDateChanged is:",
						dueDateChanged,
						"dueDateTimeChanged is:",
						dueDateTimeChanged,
						"dueTimeChanged is:",
						dueTimeChanged,
						"projectChanged is:",
						projectChanged,
						"parentIdChanged is:",
						parentIdChanged,
						"priorityChanged is:",
						priorityChanged,
						"durationChanged is:",
						durationChanged,
						"sectionChanged is:",
						sectionChanged,
						"deadlineChanged is:",
						deadlineChanged
					);
				}

				if (
					contentChanged ||
					tagsChanged ||
					dueDateChanged ||
					dueDateTimeChanged ||
					dueTimeChanged ||
					projectChanged ||
					parentIdChanged ||
					priorityChanged ||
					durationChanged ||
					sectionChanged ||
					deadlineChanged
				) {
					if (this.plugin.cacheOperation?.checkTaskIdIsOld(lineTask.id)) {
						if (this.plugin.settings.debugMode) {
							console.error(
								`Task id is using old format (${lineTask.id}), it will not trigger any update.`,
							);
						}
						return;
					}

					if (this.plugin.settings.debugMode) {
						console.log(
							"The updates to be sent to Todoist and Cache are:",
							updatedContent,
						);
					}
					const updatedTask = await this.plugin.todoistNewAPI?.updateTask(
						lineTask.id,
						{
							...updatedContent,
						},
					);

					if (updatedTask) {
						(updatedTask as { path?: string }).path = filepath;
						this.plugin.cacheOperation?.updateTaskToCacheByID(updatedTask);
						savedTask = updatedTask;
					}
				}

				if (statusModified) {
					if (lineTask.isCompleted === true) {
						this.plugin.todoistNewAPI?.closeTask(lineTask.id);
						this.plugin.cacheOperation?.closeTaskToCacheByID(lineTask.id);
					} else {
						this.plugin.todoistNewAPI?.openTask(lineTask.id);
						this.plugin.cacheOperation?.reopenTaskToCacheByID(lineTask.id);
					}

					statusChanged = true;
				}

				if (
					contentChanged ||
					statusChanged ||
					dueDateChanged ||
					dueDateTimeChanged ||
					dueTimeChanged ||
					tagsChanged ||
					projectChanged ||
					priorityChanged ||
					durationChanged ||
					sectionChanged ||
					deadlineChanged
				) {
					this.plugin.saveSettings();
					let message = `Task ${lineTask_todoist_id} is updated.`;

					if (contentChanged) {
						message += " Content was changed.";
					}
					if (statusChanged) {
						message += " Status was changed.";
					}
					if (dueDateChanged) {
						message += " Due date was changed.";
					}
					if (dueTimeChanged) {
						message += " Due time was changed.";
					}
					if (tagsChanged) {
						message += " Tags were changed.";
					}
					if (projectChanged) {
						message += " Project was changed.";
					}
					if (priorityChanged) {
						message += " Priority was changed.";
					}
					if (durationChanged) {
						message += " Duration was changed.";
					}
					if (sectionChanged) {
						message += " Section was changed.";
					}
					if (dueDateTimeChanged) {
						message += " Due date time was changed.";
					}
					if (dueDateChanged) {
						message += " Due date was changed.";
					}
					if (deadlineChanged) {
						message += " Deadline was changed.";
					}

					if (!lineTask_todoist_id === null) {
						if (this.plugin.settings.debugMode) {
							console.log(`Sent a Notice with the message: ${message}`);
						}
						new Notice(message);
					}
				}
			} catch (error) {
				console.error("Error updating task:", error);
			}
		}
	}

	async fullTextModifiedTaskCheck(file_path: string): Promise<void> {
		let file: TAbstractFile | null;
		let currentFileValue: string | null;
		let view: MarkdownView | null;
		let filepath: string | null;

		try {
			if (file_path) {
				file = this.app.vault.getAbstractFileByPath(file_path);
				filepath = file_path;
				// currentFileValue = await this.app.vault.read(file);
				// Check if the returned file is a TFile
				if (file instanceof TFile) {
					currentFileValue = await this.app.vault.read(file);
				} else {
					return;
				}
			} else {
				view = this.app.workspace.getActiveViewOfType(MarkdownView);
				file = this.app.workspace.getActiveFile();
				filepath = file?.path ?? null;
				currentFileValue = view?.data ?? null;
			}

			const content = currentFileValue;

			let hasModifiedTask = false;
			const lines = content?.split("\n");

			if (lines?.length) {
				for (let i = 0; i < lines?.length; i++) {
					const line = lines[i];
					if (
						this.plugin.taskParser?.hasTodoistId(line) &&
						this.plugin.taskParser?.hasTodoistTag(line)
					) {
						try {
							await this.lineModifiedTaskCheck(
								filepath ?? "",
								line,
								i,
								content ?? "",
							);
							hasModifiedTask = true;
						} catch (error) {
							console.error("Error modifying task:", error);
						}
					}
				}
			}

			if (hasModifiedTask) {
				// Perform necessary actions on the modified content and front matter
			}
		} catch (error) {
			console.error("Error:", error);
		}
	}

	// Close a task by calling API and updating JSON file
	async closeTask(taskId: string): Promise<void> {
		try {
			await this.plugin.todoistNewAPI?.closeTask(taskId);
			await this.plugin.fileOperation?.completeTaskInTheFile(taskId);
			await this.plugin.cacheOperation?.closeTaskToCacheByID(taskId);
			this.plugin.saveSettings();
			new Notice(`Task ${taskId} is closed.`);
		} catch (error) {
			console.error("Error closing task:", error);
			throw error; // 抛出错误使调用方能够捕获并处理它
		}
	}

	//open task
	async reopenTask(taskId: string): Promise<void> {
		try {
			await this.plugin.todoistNewAPI?.openTask(taskId);
			await this.plugin.fileOperation?.incompleteTaskInTheFile(taskId);
			await this.plugin.cacheOperation?.reopenTaskToCacheByID(taskId);
			this.plugin.saveSettings();
			new Notice(`Task ${taskId} is reopened.`);
		} catch (error) {
			console.error("Error opening task:", error);
			throw error; // 抛出错误使调用方能够捕获并处理它
		}
	}

	/**
	 * Delete the task with the specified ID from the task list and update the JSON file
	 * @param taskIds The array of task IDs to be deleted
	 * @returns Returns the array of task IDs that were successfully deleted
	 */
	async deleteTasksByIds(taskIds: string[]): Promise<string[]> {
		const deletedTaskIds = [];

		for (const taskId of taskIds) {
			const api = await this.plugin.todoistNewAPI?.initializeNewAPI();
			try {
				const response = await api?.deleteTask(taskId);

				if (response) {
					if (this.plugin.settings.debugMode) {
						console.log(`Task ${taskId} was deleted.`);
					}
					new Notice(`Task ${taskId} was deleted.`);
					deletedTaskIds.push(taskId); // 将被删除的任务 ID 加入数组
				}
			} catch (error) {
				console.error(`Failed to delete task ${taskId}: ${error}`);
				// 可以添加更好的错误处理方式，比如在这里抛出异常或者记录日志等
			}
		}

		if (!deletedTaskIds.length) {
			return [];
		}

		await this.plugin.cacheOperation?.deleteTaskFromCacheByIDs(deletedTaskIds); // 更新 JSON 文件
		this.plugin.saveSettings();

		return deletedTaskIds;
	}

	// 同步已完成的任务状态到 Obsidian file
	async syncCompletedTaskStatusToObsidian(
		unSynchronizedEvents: TodoistEvent[],
	) {
		// 获取未同步的事件
		try {
			// 处理未同步的事件并等待所有处理完成
			const processedEvents = [];
			for (const e of unSynchronizedEvents) {
				//如果要修改代码，让completeTaskInTheFile(e.object_id)按照顺序依次执行，可以将Promise.allSettled()方法改为使用for...of循环来处理未同步的事件。具体步骤如下：
				await this.plugin.fileOperation?.completeTaskInTheFile(e.object_id);
				await this.plugin.cacheOperation?.closeTaskToCacheByID(e.object_id);
				new Notice(`Task ${e.object_id} is closed.`);
				processedEvents.push(e);
			}

			// Save events to the local database."
			//const allEvents = [...savedEvents, ...unSynchronizedEvents]
			await this.plugin.cacheOperation?.appendEventsToCache(processedEvents);
			this.plugin.saveSettings();
		} catch (error) {
			console.error("Error synchronizing task status: ", error);
		}
	}

	// Synchronize the completed task status to the Obsidian file
	async syncUncompletedTaskStatusToObsidian(
		unSynchronizedEvents: TodoistEvent[],
	) {
		try {
			// Handle not_synchronized events and wait for all processing to complete
			const processedEvents = [];
			for (const e of unSynchronizedEvents) {
				//If you want to modify the code so that not_completeTaskInTheFile(e.object_id) is executed in sequence, you can change the Promise.allSettled() method to use a for...of loop to handle not_synchronized events. The specific steps are as follows:
				await this.plugin.fileOperation?.incompleteTaskInTheFile(e.object_id);
				await this.plugin.cacheOperation?.reopenTaskToCacheByID(e.object_id);
				new Notice(`Task ${e.object_id} is reopened.`);
				processedEvents.push(e);
			}

			// Merge new events into existing events and save to JSON
			//const allEvents = [...savedEvents, ...unSynchronizedEvents]
			await this.plugin.cacheOperation?.appendEventsToCache(processedEvents);
			this.plugin.saveSettings();
		} catch (error) {
			console.error("Error synchronizing task status: ", error);
		}
	}

	// Synchronize updated item status to Obsidian
	async syncUpdatedTaskToObsidian(unSynchronizedEvents: TodoistEvent[]) {
		try {
			// Handle not_synchronized events and wait for all processing to complete
			const processedEvents = [];
			for (const e of unSynchronizedEvents) {
				//If you want to modify the code so that completeTaskInTheFile(e.object_id) is executed in sequence, you can change the Promise.allSettled() method to use a for...of loop to handle not_synchronized events. The specific steps are as follows:

				new Notice(`Task ${e.object_id} has an update event from Todoist.`);

				if (
					this.plugin.settings.todoistTasksData.tasks.find(
						(task) => task.id === e.object_id,
					)?.due?.date !== e.extra_data?.due_date
				) {
					await this.syncUpdatedTaskDueDateToObsidian(e);
				}

				if (
					this.plugin.settings.todoistTasksData.tasks.find(
						(task) => task.id === e.object_id,
					)?.content !== e.extra_data?.content
				) {
					await this.syncUpdatedTaskContentToObsidian(e);
				}

				processedEvents.push(e);
			}

			// Merge new events into existing events and save to JSON
			//const allEvents = [...savedEvents, ...unSynchronizedEvents]
			this.plugin.cacheOperation?.appendEventsToCache(processedEvents);
			this.plugin.saveSettings();
		} catch (error) {
			console.error("Error syncing updated item", error);
		}
	}

	async syncUpdatedTaskContentToObsidian(e: TodoistEvent) {
		if (e.object_id && e.extra_data?.content) {
			this.plugin.fileOperation?.syncUpdatedTaskContentToTheFile({
				object_id: e.object_id,
				extra_data: {
					content: e.extra_data.content as string,
				},
			});
		}
		const content = e.extra_data?.content;
		if (content) {
			this.plugin.cacheOperation?.modifyTaskToCacheByID(e.object_id, content);
		}
		if (!e.parent_item_id === null) {
			new Notice(`The content of Task ${e.parent_item_id} has been modified.`);
		}
	}

	async syncUpdatedTaskDueDateToObsidian(e: TodoistEvent) {
		if (e.object_id && e.extra_data?.due_date) {
			this.plugin.fileOperation?.syncUpdatedTaskDueDateToTheFile({
				object_id: e.object_id,
				extra_data: {
					due_date: e.extra_data.due_date as string,
				},
			});
		}
		//Modify the cache date, use the todoist format
		const due = await this.plugin.todoistNewAPI?.getTaskDueById(e.object_id);
		if (due) {
			this.plugin.cacheOperation?.modifyTaskToCacheByID(e.object_id, { due });
		}
		if (!e.parent_item_id === null) {
			new Notice(`The due date of Task ${e.parent_item_id} has been modified.`);
		}
	}

	// sync added task note to obsidian
	async syncAddedTaskNoteToObsidian(unSynchronizedEvents: TodoistEvent[]) {
		// Get not_synchronized events
		try {
			// Handle not_synchronized events and wait for all processing to complete
			const processedEvents = [];
			for (const e of unSynchronizedEvents) {
				if (e.parent_item_id && e.event_date && e.extra_data?.content) {
					await this.plugin.fileOperation?.syncAddedTaskNoteToTheFile({
						parent_item_id: e.parent_item_id,
						event_date: e.event_date,
						extra_data: {
							content: e.extra_data.content as string,
							event_date: e.event_date,
						},
					});
					new Notice(`Task ${e.parent_item_id} note is added.`);
					processedEvents.push(e);
				}
			}

			// Merge new events into existing events and save to JSON

			await this.plugin.cacheOperation?.appendEventsToCache(processedEvents);
			this.plugin.saveSettings();
		} catch (error) {
			console.error("Error synchronizing task status: ", error);
		}
	}

	async syncTodoistToObsidian() {
		try {
			const all_activity_events =
				await this.plugin.todoistNewAPI?.getNonObsidianAllActivityEvents();

			// remove synchronized events
			const savedEvents = this.plugin.cacheOperation?.loadEventsFromCache();
			const result1 =
				all_activity_events?.filter(
					(objA: TodoistEvent) =>
						!savedEvents?.some((objB: TodoistEvent) => objB.id === objA.id),
				) ?? [];

			const savedTasks = this.plugin.cacheOperation?.loadTasksFromCache();
			// Find the task activity whose task id exists in Obsidian
			const result2 = result1.filter((objA: TodoistEvent) =>
				savedTasks?.some((objB: Task) => objB.id === objA.object_id),
			);

			// Find the task id that exists in the note activity in Obsidian
			const result3 = result1.filter((objA: TodoistEvent) =>
				savedTasks?.some((objB: Task) => objB.id === objA.parent_item_id),
			);

			const not_synchronized_item_completed_events =
				this.plugin.todoistNewAPI?.filterActivityEvents(result2, {
					event_type: "completed",
					object_type: "item",
				});
			const not_synchronized_item_uncompleted_events =
				this.plugin.todoistNewAPI?.filterActivityEvents(result2, {
					event_type: "uncompleted",
					object_type: "item",
				});

			//Items updated (only changes to content, description, due_date and responsible_uid)
			const not_synchronized_item_updated_events =
				this.plugin.todoistNewAPI?.filterActivityEvents(result2, {
					event_type: "updated",
					object_type: "item",
				});

			const not_synchronized_notes_added_events =
				this.plugin.todoistNewAPI?.filterActivityEvents(result3, {
					event_type: "added",
					object_type: "note",
				});
			const not_synchronized_project_events =
				this.plugin.todoistNewAPI?.filterActivityEvents(result1, {
					object_type: "project",
				});

			await this.syncCompletedTaskStatusToObsidian(
				not_synchronized_item_completed_events ?? [],
			);
			await this.syncUncompletedTaskStatusToObsidian(
				not_synchronized_item_uncompleted_events ?? [],
			);
			await this.syncUpdatedTaskToObsidian(
				not_synchronized_item_updated_events ?? [],
			);
			await this.syncAddedTaskNoteToObsidian(
				not_synchronized_notes_added_events ?? [],
			);
			if (not_synchronized_project_events?.length) {
				await this.plugin.cacheOperation?.saveProjectsToCache();
				await this.plugin.cacheOperation?.appendEventsToCache(
					not_synchronized_project_events,
				);
			}
		} catch (err) {
			console.error("An error occurred while synchronizing:", err);
		}
	}

	async backupTodoistAllResources() {
		try {
			const resources = await this.plugin.todoistNewAPI?.getAllResources();

			const now: Date = new Date();
			const timeString = `${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;

			const name = `todoist-backup-${timeString}.json`;

			this.app.vault.create(name, JSON.stringify(resources));
			new Notice(`Todoist backup data is saved in the path ${name}`);
		} catch (error) {
			console.error("An error occurred while creating Todoist backup:", error);
		}
	}

	//After renaming the file, check all tasks in the file and update all links.
	async updateTaskDescription(filepath: string) {
		const metadata =
			await this.plugin.cacheOperation?.getFileMetadataByFilePath(filepath);
		if (!metadata || !metadata.todoistTasks) {
			return;
		}
		const description =
			this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath);
		const updatedContent = { description: description };
		updatedContent.description = description;
		try {
			for (const taskId of metadata.todoistTasks) {
				const updatedTask = await this.plugin.todoistNewAPI?.updateTask(
					taskId,
					updatedContent,
				);
				if (!updatedTask) {
					console.error(`Failed to update task ${taskId} description`);
					return;
				}
				this.plugin.cacheOperation?.updateTaskToCacheByID(updatedTask);
			}
		} catch (error) {
			console.error("An error occurred in updateTaskDescription:", error);
		}
	}
}
