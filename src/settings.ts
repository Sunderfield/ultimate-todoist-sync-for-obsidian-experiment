import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import AnotherSimpleTodoistSync from "../main";

interface MyProject {
	id: string;
	name: string;
}


export interface UltimateTodoistSyncSettings {
	initialized: boolean;
	//todoistTasksFilePath: string;
	todoistAPIToken: string; // replace with correct type
	apiInitialized: boolean;
	defaultProjectName: string;
	defaultProjectId: string;
	automaticSynchronizationInterval: number;
	todoistTasksData: any;
	fileMetadata: any;
	enableFullVaultSync: boolean;
	statistics: any;
	debugMode: boolean;
	commentsSync: boolean;
	alternativeKeywords: boolean;
	customSyncTag: string;
	experimentalFeatures: boolean;
}


export const DEFAULT_SETTINGS: Partial<UltimateTodoistSyncSettings> = {
	initialized: false,
	apiInitialized: false,
	defaultProjectName: "Inbox",
	automaticSynchronizationInterval: 150, //default aync interval 300s
	todoistTasksData: { "projects": [], "tasks": [], "events": [] },
	fileMetadata: {},
	enableFullVaultSync: false,
	statistics: {},
	debugMode: false,
	commentsSync: true,
	alternativeKeywords: false,
	customSyncTag: "#tdsync",
	experimentalFeatures: false,

}





export class AnotherTodoistSyncPluginSettingTab extends PluginSettingTab {
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const myProjectsOptions: MyProject | undefined = this.plugin.settings.todoistTasksData?.projects?.reduce((obj:any, item:any) => {
			obj[(item.id).toString()] = item.name;
			return obj;
		}, {});

		new Setting(containerEl)
			.setName('Todoist API')
			.setDesc('Please enter Todoist api token and click the paper airplane button to submit.')
			.addText((text) =>
				text
					.setPlaceholder('Enter your API')
					.setValue(this.plugin.settings.todoistAPIToken)
					.onChange(async (value) => {
						this.plugin.settings.todoistAPIToken = value;
						this.plugin.settings.apiInitialized = false;
						//
					})

			)
			.addExtraButton((button) => {
				button.setIcon('send')
					.onClick(async () => {
						await this.plugin.modifyTodoistAPI(this.plugin.settings.todoistAPIToken)
						this.display()

					})


			})




		new Setting(containerEl)
			.setName('Automatic sync interval time')
			.setDesc('Please specify the desired interval time, with seconds as the default unit. The default setting is 300 seconds, which corresponds to syncing once every 5 minutes. You can customize it, but it cannot be lower than 20 seconds.')
			.addText((text) =>
				text
					.setPlaceholder('Sync interval')
					.setValue(this.plugin.settings.automaticSynchronizationInterval.toString())
					.onChange(async (value) => {
						const intervalNum = Number(value)
						if (isNaN(intervalNum)) {
							new Notice(`Wrong type,please enter a number.`)
							return
						}
						if (intervalNum < 20) {
							new Notice(`The synchronization interval time cannot be less than 20 seconds.`)
							return
						}
						if (!Number.isInteger(intervalNum)) {
							new Notice('The synchronization interval must be an integer.');
							return;
						}
						this.plugin.settings.automaticSynchronizationInterval = intervalNum;
						this.plugin.saveSettings()
						new Notice('Settings have been updated.');
						//
					})

			)

		new Setting(containerEl)
			.setName('Default project')
			.setDesc('New tasks are automatically synced to the default project. You can modify the project here.')
			.addDropdown(component =>
				component
					.addOption(this.plugin.settings.defaultProjectId, this.plugin.settings.defaultProjectName)
					.addOptions(myProjectsOptions)
					.onChange((value) => {
						this.plugin.settings.defaultProjectId = value
						this.plugin.settings.defaultProjectName = this.plugin.cacheOperation?.getProjectNameByIdFromCache(value)
						this.plugin.saveSettings()


					})

			)


		new Setting(containerEl)
			.setName('Manual sync')
			.setDesc('Manually perform a synchronization task.')
			.addButton(button => button
				.setButtonText('Sync')
				.onClick(async () => {
					// Add code here to handle exporting Todoist data
					if (!this.plugin.settings.apiInitialized) {
						new Notice(`Please set the Todoist api first`)
						return
					}
					try {
						await this.plugin.scheduledSynchronization()
						this.plugin.syncLock = false
						new Notice(`Sync with Todoist completed.`)
					} catch (error) {
						new Notice(`An error occurred while syncing.:${error}`)
						this.plugin.syncLock = false
					}

				})
			);



		new Setting(containerEl)
			.setName('Check database')
			.setDesc('Check for possible issues: sync error, file renaming not updated, or missed tasks not synchronized.')
			.addButton(button => button
				.setButtonText('Check Database')
				.onClick(async () => {
					// Add code here to handle exporting Todoist data
					if (!this.plugin.settings.apiInitialized) {
						new Notice(`Please set the Todoist api first`)
						return
					}

					//reinstall plugin



					//check file metadata
					await this.plugin.cacheOperation?.checkFileMetadata()
					this.plugin.saveSettings()
					const metadatas = await this.plugin.cacheOperation?.getFileMetadatas()
					// check default project task amounts
					try {
						const projectId = this.plugin.settings.defaultProjectId
						const options = { projectId: projectId }
						options.projectId = projectId
						const tasks = await this.plugin.todoistRestAPI?.GetActiveTasks(options)
						const length = Number(tasks?.length)
						if (length >= 300) {
							new Notice(`The number of tasks in the default project exceeds 300, reaching the upper limit. It is not possible to add more tasks. Please modify the default project.`)
						}

					} catch (error) {
						console.error(`An error occurred while get tasks from todoist: ${error.message}`);
					}

					if (!await this.plugin.checkAndHandleSyncLock()) return;



					//check empty task				
					for (const key in metadatas) {
						const value = metadatas[key];
						for (const taskId of value.todoistTasks) {

							let taskObject

							try {
								taskObject = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)
							} catch (error) {
								console.error(`An error occurred while loading task cache: ${error.message}`);
							}

							if (!taskObject) {
								//get from Todoist 
								try {
									taskObject = await this.plugin.todoistRestAPI?.getTaskById(taskId);
								} catch (error) {
									if (error.message.includes('404')) {
										// 处理404错误
										await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(key, taskId)
										continue
									} else {
										// 处理其他错误
										console.error(error);
										continue
									}
								}

							}
						}

					}
					this.plugin.saveSettings()


					try {
						//check renamed files
						for (const key in metadatas) {
							const value = metadatas[key];
							const newDescription = this.plugin.taskParser?.getObsidianUrlFromFilepath(key)
							for (const taskId of value.todoistTasks) {

								let taskObject
								try {
									taskObject = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)
								} catch (error) {
									console.error(`An error occurred while loading task ${taskId} from cache: ${error.message}`);
								}
								if (!taskObject) {
									continue
								}
								const oldDescription = taskObject?.description ?? '';
								if (newDescription != oldDescription) {
									try {
										//await this.plugin.todoistSync?.updateTaskDescription(key)
									} catch (error) {
										console.error(`An error occurred while updating task discription: ${error.message}`);
									}

								}

							}

						}

						//check empty file metadata

						//check calendar format



						//check omitted tasks
						const files = this.app.vault.getFiles()
						files.forEach(async (v, i) => {
							if (v.extension == "md") {
								try {
									await this.plugin.fileOperation?.addTodoistLinkToFile(v.path)
									if (this.plugin.settings.enableFullVaultSync) {
										await this.plugin.fileOperation?.addTodoistTagToFile(v.path)
									}


								} catch (error) {
									console.error(`An error occurred while check new tasks in the file: ${v.path}, ${error.message}`);

								}

							}
						});
						this.plugin.syncLock = false
						new Notice(`All files have been scanned.`)
					} catch (error) {
						console.error(`An error occurred while scanning the vault.:${error}`)
						this.plugin.syncLock = false
					}

				})
			);


		new Setting(containerEl)
			.setName('Sync comments')
			.setDesc("When enabled, new Todoist comments won't by added below tasks")
			.addToggle(component =>
				component.setValue(this.plugin.settings.commentsSync)
					.onChange((value) => {
						this.plugin.settings.commentsSync = value
						this.plugin.saveSettings()
					})
			);



		new Setting(containerEl)
			.setName('Backup Todoist data')
			.setDesc('Click to backup Todoist data, The backed-up files will be stored in the root directory of the Obsidian vault.')
			.addButton(button => button
				.setButtonText('Backup')
				.onClick(() => {
					// Add code here to handle exporting Todoist data
					if (!this.plugin.settings.apiInitialized) {
						new Notice(`Please set the Todoist api first`)
						return
					}
					this.plugin.todoistSync?.backupTodoistAllResources()
				})
			);


		new Setting(containerEl)
			.setName('Experimental features')
			.setDesc('Enable experimental features. Some might not be working yet.')
			.addToggle(component =>
				component
					.setValue(this.plugin.settings.experimentalFeatures)
					.onChange((value) => {
						this.plugin.settings.experimentalFeatures = value
						this.plugin.saveSettings()
						new Notice('Experimental features have been enabled. Close this window and open again to see the experimental features.')
					})
			)

		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName('Custom sync tag')
				.setDesc('Set a custom tag to sync tasks with Todoist. NOTE: Using #todoist might conflict with old version of this plugin')
				.addText((text) => text.setPlaceholder('Enter custom tag')
					.setValue(this.plugin.settings.customSyncTag).onChange(async (value) => {
						this.plugin.settings.customSyncTag = value;
						// TODO add validation on the value of 'value' to make sure is a tag with #
						this.plugin.saveSettings()
						new Notice('New custom sync tag have been updated.');
					}));
		}
		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName('Alternative keywords')
				.setDesc('Enable the use of @ for settings calendar time, $ for time and & for duration.')
				.addToggle(component =>
					component.setValue(this.plugin.settings.alternativeKeywords).onChange((value) => {
						this.plugin.settings.alternativeKeywords = value
						this.plugin.saveSettings()
					}));
		}

		// TODO need to evaluate if this feature is still working after all the new features
		if(this.plugin.settings.experimentalFeatures){
			new Setting(containerEl)
			.setName('Full vault sync')
			.setDesc('By default, only tasks marked with #todoist are synchronized. If this option is turned on, all tasks in the vault will be synchronized.')
			.addToggle(component =>
				component
				.setValue(this.plugin.settings.enableFullVaultSync)
				.onChange((value) => {
					this.plugin.settings.enableFullVaultSync = value
					this.plugin.saveSettings()
					new Notice("Full vault sync is enabled.")
				})
				
			)
		}

		new Setting(containerEl)
		.setName('Debug mode')
		.setDesc('Enable this option to log information will on the development console, which can help troubleshoot for errors.')
		.addToggle(component =>
			component
				.setValue(this.plugin.settings.debugMode)
				.onChange((value) => {
					this.plugin.settings.debugMode = value
					this.plugin.saveSettings()
				})

		);
	}
}

