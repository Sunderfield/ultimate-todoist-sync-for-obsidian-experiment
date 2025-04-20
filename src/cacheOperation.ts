import type { App } from "obsidian";
import type AnotherSimpleTodoistSync from "../main";

interface Due {
	date: string;
	datetime?: string;
	string?: string;
	timezone?: string;
}

export interface Task {
	id: string;
	content: string;
	description?: string;
	project_id?: string;
	section_id?: string;
	parent_id?: string;
	order?: number;
	priority?: number;
	due_date?: string;
	due_datetime?: string;
	due?: {
		date: string;
		datetime?: string;
		string?: string;
		timezone?: string;
	};
	url?: string;
	comment_count?: number;
	created?: string;
	creator_id?: string;
	assignee_id?: string;
	assigner_id?: string;
	labels?: string[];
	duration?: number;
	duration_unit?: "minute" | "day";
	isCompleted?: boolean;
	path?: string;
}

interface Project {
	id: string;
	name: string;
}

interface Section {
	id: string;
	name: string;
	project_id: string;
}

export interface FileMetadata {
	todoistTasks: string[];
	todoistCount: number;
	defaultProjectId?: string;
}

interface TodoistSection {
	id: string;
	name: string;
	project_id: string;
}

export class CacheOperation {
	app: App;
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;
	}

	async getFileMetadata(filepath: string) {
		return this.plugin.settings.fileMetadata[filepath] ?? null;
	}

	async getFileMetadatas() {
		return this.plugin.settings.fileMetadata ?? null;
	}

	async newEmptyFileMetadata(filepath: string) {
		const metadatas = this.plugin.settings.fileMetadata;
		if (metadatas[filepath]) {
			return;
		}
		metadatas[filepath] = {
			todoistTasks: [],
			todoistCount: 0,
		};
		// 将更新后的metadatas对象保存回设置对象中
		this.plugin.settings.fileMetadata = metadatas;
	}

	async updateFileMetadata(filepath: string, newMetadata: FileMetadata) {
		const metadatas = this.plugin.settings.fileMetadata;

		// 如果元数据对象不存在，则创建一个新的对象并添加到metadatas中
		if (!metadatas[filepath]) {
			metadatas[filepath] = {
				todoistTasks: [],
				todoistCount: 0,
			};
		}

		// 更新元数据对象中的属性值
		metadatas[filepath].todoistTasks = newMetadata.todoistTasks;
		metadatas[filepath].todoistCount = newMetadata.todoistCount;

		// 将更新后的metadatas对象保存回设置对象中
		this.plugin.settings.fileMetadata = metadatas;
	}

	async deleteTaskIdFromMetadata(filepath: string, taskId: string) {
		const metadata = await this.getFileMetadata(filepath);
		const newTodoistTasks = metadata.todoistTasks.filter(
			(element: string) => element !== taskId,
		);
		const newTodoistCount = metadata.todoistCount - 1;
		const newMetadata: FileMetadata = {
			todoistTasks: newTodoistTasks,
			todoistCount: newTodoistCount,
		};
		await this.updateFileMetadata(filepath, newMetadata);
	}

	//delete filepath from filemetadata
	async deleteFilepathFromMetadata(filepath: string) {
		Reflect.deleteProperty(this.plugin.settings.fileMetadata, filepath);
		this.plugin.saveSettings();
	}

	//Check errors in filemata where the filepath is incorrect.
	async checkFileMetadata() {
		const metadatas = await this.getFileMetadatas();
		for (const key in metadatas) {
			const filepath = key;
			const value = metadatas[key];
			const file = this.app.vault.getAbstractFileByPath(key);
			if (!file && (value.todoistTasks?.length === 0 || !value.todoistTasks)) {
				await this.deleteFilepathFromMetadata(key);
				continue;
			}
			if (value.todoistTasks?.length === 0 || !value.todoistTasks) {
				//todo
				//delelte empty metadata
				continue;
			}
			//check if file exist

			if (!file) {
				//search new filepath
				const todoistId1 = value.todoistTasks[0];
				const searchResult =
					await this.plugin.fileOperation?.searchFilepathsByTaskidInVault(
						todoistId1,
					);

				//update metadata
				if (searchResult) {
					await this.updateRenamedFilePath(filepath, searchResult);
				}
				this.plugin.saveSettings();
			}

			//const fileContent = await this.app.vault.read(file)
			//check if file include all tasks

			/*
            value.todoistTasks.forEach(async(taskId) => {
                const taskObject = await this.plugin.cacheOperation.loadTaskFromCacheID(taskId)


            });
            */
		}
	}

	getDefaultProjectNameForFilepath(filepath: string) {
		const metadatas = this.plugin.settings.fileMetadata;
		if (
			!metadatas[filepath] ||
			metadatas[filepath].defaultProjectId === undefined
		) {
			return this.plugin.settings.defaultProjectName;
		}
		const defaultProjectId = metadatas[filepath].defaultProjectId;
		const defaultProjectName =
			this.getProjectNameByIdFromCache(defaultProjectId);
		return defaultProjectName;
	}

	getDefaultProjectIdForFilepath(filepath: string) {
		const metadatas = this.plugin.settings.fileMetadata;
		if (
			!metadatas[filepath] ||
			metadatas[filepath].defaultProjectId === undefined
		) {
			return this.plugin.settings.defaultProjectId;
		}
		const defaultProjectId = metadatas[filepath].defaultProjectId;
		return defaultProjectId;
	}

	setDefaultProjectIdForFilepath(filepath: string, defaultProjectId: string) {
		const metadatas = this.plugin.settings.fileMetadata;
		if (!metadatas[filepath]) {
			metadatas[filepath] = {
				todoistTasks: [],
				todoistCount: 0,
			};
		}
		metadatas[filepath].defaultProjectId = defaultProjectId;

		// 将更新后的metadatas对象保存回设置对象中
		this.plugin.settings.fileMetadata = metadatas;
	}

	// 从 Cache读取所有task
	loadTasksFromCache() {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			return savedTasks;
		} catch (error) {
			console.error(`Error loading tasks from Cache: ${error}`);
			return [];
		}
	}

	// 覆盖保存所有task到cache
	saveTasksToCache(newTasks: Task[]) {
		try {
			this.plugin.settings.todoistTasksData.tasks = newTasks;
		} catch (error) {
			console.error(`Error saving tasks to Cache: ${error}`);
			return false;
		}
	}

	// append event 到 Cache
	appendEventToCache(
		event: {
			id: string;
			object_type: string;
			object_id: string;
			event_type: string;
			event_date: string;
			parent_item_id?: string;
			extra_data?: {
				content?: string;
				last_content?: string;
				last_due_date?: string;
				client?: string;
			};
		}[],
	) {
		try {
			this.plugin.settings.todoistTasksData.events.push(...event);
		} catch (error) {
			console.error(`Error append event to Cache: ${error}`);
		}
	}

	// append events 到 Cache
	appendEventsToCache(
		events: {
			id: string;
			object_type: string;
			object_id: string;
			event_type: string;
			event_date: string;
			parent_item_id?: string;
			extra_data?: {
				content?: string;
				last_content?: string;
				last_due_date?: string;
				client?: string;
			};
		}[],
	) {
		try {
			this.plugin.settings.todoistTasksData.events.push(...events);
		} catch (error) {
			console.error(`Error append events to Cache: ${error}`);
		}
	}

	// 从 Cache 文件中读取所有events
	loadEventsFromCache() {
		try {
			const savedEvents = this.plugin.settings.todoistTasksData.events;
			return savedEvents;
		} catch (error) {
			console.error(`Error loading events from Cache: ${error}`);
		}
	}

	// 追加到 Cache 文件
	appendTaskToCache(task: Task) {
		// TODO for some reason the task receives duration even when was not specified, so I had to add this extra step to remove it. I need to find a better way to handle this.
		const taskToAppend =
			task.duration === null ? (({ duration, ...rest }) => rest)(task) : task;
		try {
			if (taskToAppend === null) {
				return;
			}
			// const savedTasks = this.plugin.settings.todoistTasksData.tasks
			//const taskAlreadyExists = savedTasks.some((t) => t.id === task.id);
			//if (!taskAlreadyExists) {
			//，使用push方法将字符串插入到Cache对象时，它将被视为一个简单的键值对，其中键是数组的数字索引，而值是该字符串本身。但如果您使用push方法将另一个Cache对象（或数组）插入到Cache对象中，则该对象将成为原始Cache对象的一个嵌套子对象。在这种情况下，键是数字索引，值是嵌套的Cache对象本身。
			//}
			this.plugin.settings.todoistTasksData.tasks.push(taskToAppend);
		} catch (error) {
			console.error(`Error appending task to Cache: ${error}`);
		}
	}

	// As Todoist default object doesn't contain the filepath, this helps ensure we know where each task is located for future sync updateds
	appendPathToTaskInCache(taskId: string, filepath: string) {
		const findObject = this.plugin.settings.todoistTasksData.tasks.find(
			(task: Task & { path?: string }) => task.id === taskId,
		);
		if (findObject) {
			(findObject as Task & { path?: string }).path = filepath;
		} else {
			console.error(
				`Object with ID ${taskId} not found on cache to append it's path.`,
			);
		}
	}

	// Find task by id within the cache
	loadTaskFromCacheID(taskId: string): Task | undefined {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const savedTask = savedTasks.find((t: Task) => t.id === taskId);
			return savedTask as Task | undefined;
		} catch (error) {
			console.error(`Error finding task from Cache: ${error}`);
			return undefined;
		}
	}

	// Compare the string with the names of sections on the cache. If exist, return it's ID. If not, return null.
	checkIfSectionExistOnCache(sectionString: string, projectId: string) {
		const savedSections =
			this.plugin.settings.todoistTasksData.sections?.results;
		if (!savedSections) return false;

		const sectionExist = savedSections.some(
			(section: Section) =>
				section.name === sectionString && section.project_id === projectId,
		);

		if (sectionExist) {
			// If it finds the section, it returns the section ID. If not, will return false
			const sectionDetails = savedSections.find(
				(section: Section) =>
					section.name === sectionString && section.project_id === projectId,
			);

			return sectionDetails?.id;
		}

		return false;
	}

	// Compare the string with the names of projects on the cache. If exist, returns it's ID. If not, return a null value.
	checkIfProjectExistOnCache(projectString: string) {
		const savedProjects = this.plugin.settings.todoistTasksData.projects;
		const projectExist = savedProjects.results.some(
			(project: Project) => project.name === projectString,
		);

		if (projectExist) {
			const projectDetails = savedProjects.results.find(
				(project: Project) => project.name === projectString,
			);
			return projectDetails?.id;
		}
		return false;
	}

	addSectionToCache(name: string, sectionId: string, project_id: string) {
		// TODO get all details from the TodoistApi, then saves to cache
		try {
			this.plugin.settings.todoistTasksData?.sections?.results.push({
				name: name,
				id: sectionId,
				project_id: project_id,
			} as TodoistSection);
		} catch (error) {
			console.error(`Error appending section to Cache: ${error}`);
		}
	}

	// Add a new project to cache
	addProjectToCache(projectString: string, project_id: string) {
		try {
			this.plugin.settings.todoistTasksData.projects.results.push({
				name: projectString,
				id: project_id,
			});
		} catch (error) {
			console.error(`Error appending project to Cache: ${error}`);
		}
	}

	// Find the name of the section based on a given ID
	getSectionNameByIdFromCache(sectionId: string) {
		try {
			const savedSections = this.plugin.settings.todoistTasksData.sections;
			if (!savedSections) return null;

			const targetSection = savedSections.results.find(
				(obj: Section) => obj.id === sectionId,
			);
			const sectionName = targetSection ? targetSection.name : null;
			return sectionName;
		} catch (error) {
			console.error(`Error finding section from Cache file: ${error}`);
			return false;
		}
	}

	getSectionIdByNameFromCache(sectionName: string) {
		const savedSections = this.plugin.settings.todoistTasksData.sections;
		if (!savedSections) return null;

		const targetSection = savedSections.results.find(
			(obj: Section) => obj.name === sectionName,
		);
		console.log("targetSection is: ", targetSection);
		return targetSection ? targetSection.id : null;
	}

	//覆盖update指定id的task
	updateTaskToCacheByID(task: Task) {
		try {
			//删除就的task
			this.deleteTaskFromCache(task.id);
			//添加新的task
			this.appendTaskToCache(task);
		} catch (error) {
			console.error(`Error updating task to Cache: ${error}`);
			return;
		}
	}

	// Update just the sectionID from a given task within the Cache
	updateTaskSectionOnCacheById(taskId: string, newSectionId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const taskIndex = savedTasks.findIndex(
				(task: Task) => task.id === taskId,
			);

			if (taskIndex !== -1) {
				const updatedTask = { ...savedTasks[taskIndex] };
				if (newSectionId !== undefined) {
					updatedTask.section_id = newSectionId;
				}
				savedTasks[taskIndex] = updatedTask;
				this.plugin.settings.todoistTasksData.tasks = savedTasks;
			} else {
				throw new Error(`Task with ID ${taskId} not found in cache.`);
			}
		} catch (error) {
			console.error(`Error updating task to Cache: ${error}`);
		}
	}

	modifyTaskToCacheByID(
		taskId: string,
		{ content, due }: { content?: string; due?: Due },
	): void {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const taskIndex = savedTasks.findIndex(
				(task: Task) => task.id === taskId,
			);

			if (taskIndex !== -1) {
				const updatedTask = { ...savedTasks[taskIndex] };

				if (content !== undefined) {
					updatedTask.content = content;
				}

				if (due !== undefined) {
					if (due === null) {
						updatedTask.due = undefined;
					} else {
						updatedTask.due = due;
					}
				}

				savedTasks[taskIndex] = updatedTask;

				this.plugin.settings.todoistTasksData.tasks = savedTasks;
			} else {
				throw new Error(`Task with ID ${taskId} not found in cache.`);
			}
		} catch (error) {
			console.error(`Error updating task to Cache: ${error}`);
		}
	}

	//open a task status
	reopenTaskToCacheByID(taskId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;

			// 遍历数组以查找具有指定 ID 的项
			for (let i = 0; i < savedTasks.length; i++) {
				if (savedTasks[i].id === taskId) {
					// 修改对象的属性
					(savedTasks[i] as Task).isCompleted = false;
					break; // 找到并修改了该项，跳出循环
				}
			}
			this.plugin.settings.todoistTasksData.tasks = savedTasks;
		} catch (error) {
			console.error(`Error open task to Cache file: ${error}`);
			return;
		}
	}

	//close a task status
	closeTaskToCacheByID(taskId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;

			// 遍历数组以查找具有指定 ID 的项
			for (let i = 0; i < savedTasks.length; i++) {
				if (savedTasks[i].id === taskId) {
					// 修改对象的属性
					(savedTasks[i] as Task).isCompleted = true;
					break; // 找到并修改了该项，跳出循环
				}
			}
			this.plugin.settings.todoistTasksData.tasks = savedTasks;
		} catch (error) {
			console.error(`Error close task to Cache file: ${error}`);
			throw error; // 抛出错误使调用方能够捕获并处理它
		}
	}

	// 通过 ID 删除任务
	deleteTaskFromCache(taskId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const newSavedTasks = savedTasks.filter((t: Task) => t.id !== taskId);
			this.plugin.settings.todoistTasksData.tasks = newSavedTasks;
		} catch (error) {
			console.error(`Error deleting task from Cache file: ${error}`);
		}
	}

	deleteTaskFromCacheByIDs(deletedTaskIds: string[]) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const newSavedTasks = savedTasks.filter(
				(t: Task) => !deletedTaskIds.includes(t.id),
			);
			this.plugin.settings.todoistTasksData.tasks = newSavedTasks;
		} catch (error) {
			console.error(`Error deleting task from Cache : ${error}`);
		}
	}

	getProjectIdByNameFromCache(projectName: string) {
		const projectNameToFind = projectName;
		try {
			const savedProjects =
				this.plugin.settings.todoistTasksData.projects.results;
			const targetProject = savedProjects.find(
				(obj: Project) => obj.name === projectNameToFind,
			);
			const projectId = targetProject ? targetProject.id : null;
			return projectId;
		} catch (error) {
			console.error(`Error finding project from Cache file: ${error}`);
			return false;
		}
	}

	getProjectNameByIdFromCache(projectId: string) {
		try {
			const savedProjects =
				this.plugin.settings.todoistTasksData.projects.results;
			const targetProject = savedProjects.find(
				(obj: Project) => obj.id === projectId,
			);
			const projectName = targetProject ? targetProject.name : null;
			return projectName;
		} catch (error) {
			console.error(`Error finding project from Cache file: ${error}`);
			return "";
		}
	}

	//save projects data to json file
	async saveProjectsToCache() {
		try {
			//get projects
			const projects = await this.plugin.todoistNewAPI?.getAllProjects();
			if (!projects) {
				return false;
			}

			//save to json
			this.plugin.settings.todoistTasksData.projects = projects;

			return true;
		} catch (error) {
			console.error(`error downloading projects: ${error}`);
			return false;
		}
	}

	async saveSectionsToCache() {
		try {
			const sections = await this.plugin.todoistNewAPI?.getAllSections();

			if (!sections) {
				console.error("Error saving sections to Cache.");
				return false;
			}

			this.plugin.settings.todoistTasksData.sections = sections;

			return true;
		} catch (error) {
			console.error(`Error downloading sections: ${error}`);
			return false;
		}
	}

	async updateRenamedFilePath(oldpath: string, newpath: string) {
		try {
			const savedTask = await this.loadTasksFromCache();
			//console.log(savedTask)
			const newTasks = savedTask.map((obj: Task) => {
				if (obj.path === oldpath) {
					return { ...obj, path: newpath };
				}
				return obj;
			});
			//console.log(newTasks)
			await this.saveTasksToCache(newTasks);

			//update filepath
			const fileMetadatas = this.plugin.settings.fileMetadata;
			fileMetadatas[newpath] = fileMetadatas[oldpath];
			delete fileMetadatas[oldpath];
			this.plugin.settings.fileMetadata = fileMetadatas;
		} catch (error) {
			console.error(`Error updating renamed file path to cache: ${error}`);
		}
	}
}
