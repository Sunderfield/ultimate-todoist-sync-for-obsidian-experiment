import { MarkdownView, Notice, Plugin, Editor } from 'obsidian';


//settings
import { UltimateTodoistSyncSettings as AnotherSimpleTodoistSyncSettings, DEFAULT_SETTINGS, AnotherTodoistSyncPluginSettingTab as AnotherTodoistSyncPluginSettingTab } from './src/settings';
//Todoist  api
import { TodoistRestAPI } from './src/todoistRestAPI';
import { TodoistSyncAPI } from './src/todoistSyncAPI';
//task parser 
import { TaskParser } from './src/taskParser';
//cache task read and write
import { CacheOperation } from './src/cacheOperation';
//file operation
import { FileOperation } from './src/fileOperation';

//sync module
import { TodoistSync } from './src/syncModule';


//import modal
import { SetDefalutProjectInTheFilepathModal } from 'src/modal';

export default class AnotherSimpleTodoistSync extends Plugin {
	settings: AnotherSimpleTodoistSyncSettings;
	todoistRestAPI: TodoistRestAPI | undefined;
	todoistSyncAPI: TodoistSyncAPI | undefined;
	taskParser: TaskParser | undefined;
	cacheOperation: CacheOperation | undefined;
	fileOperation: FileOperation | undefined;
	todoistSync: TodoistSync | undefined;
	lastLines: Map<string, number>;
	statusBar: any;
	syncLock: boolean;

	async onload() {

		const isSettingsLoaded = await this.loadSettings();

		if (!isSettingsLoaded) {
			new Notice('Settings failed to load. Please reload the Another Simple Todoist Sync plugin.');
			return;
		}
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AnotherTodoistSyncPluginSettingTab(this.app, this));
		if (!this.settings.todoistAPIToken) {
			new Notice('Please enter your Todoist API.');
			//return	   
		} else {
			await this.initializePlugin();
		}

		//lastLine 对象 {path:line}保存在lastLines map中
		this.lastLines = new Map();

		// Create a syncLock effect to prevent sync of tasks while Obsidian is still indexing files and downloading updates
		let initialSyncIsLocked:boolean;

		function runAfter60Seconds() {
			initialSyncIsLocked = false;
			// Place your event code here
		}
				
		function startCounter() {
			setTimeout(() => {
			runAfter60Seconds();
			}, 60000); // 60 seconds
		}

		if(this.settings.delayedSync) {
			// Start the counter
			initialSyncIsLocked = true
			startCounter();
				
		}



		//key 事件监听，判断换行和删除
		this.registerDomEvent(document, 'keyup', async (evt: KeyboardEvent) => {
			if (!this.settings.apiInitialized) {
				return
			}
			//console.log(`key pressed`)

			//Determine the area where the click event occurs. If it is not in the editor，return
			if (!(this.app.workspace.activeEditor?.editor?.hasFocus())) {
				return
			}

			if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown' || evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||evt.key === 'PageUp' || evt.key === 'PageDown') {
				if(initialSyncIsLocked){
					return
				}
				// TODO for some reason, in some cases, without this wait, the task is deleted just after the task is created. Still didnt found why
				await new Promise(resolve => setTimeout(resolve, 10000));
				//console.log(`${evt.key} arrow key is released`);
				if(!( this.checkModuleClass())){
					return
				}
				this.lineNumberCheck()
			}

			if(evt.key === 'Enter'){

				// if the plugin settings for sync is enabled, it won't sync for the first 60 seconds
				if(initialSyncIsLocked){
					return
				}
				// Check if the line has a task when the user hits "enter" (to select a tag)
				// TODO needs to modify lineContentNewTaskCheck to accept if is the current ore previous line, so when the user jumps to the next line, we can check for a task within the previous line
				try{
					const editor = this.app.workspace.activeEditor?.editor
					const view = this.app.workspace.getActiveViewOfType(MarkdownView)

					if(!this.settings.apiInitialized){
						return
					}
		
					this.lineNumberCheck()
					if(!(this.checkModuleClass())){
						return
					}
					if(this.settings.enableFullVaultSync){
						return
					}
					if (!await this.checkAndHandleSyncLock()) return;
					if(view){
						await this.todoistSync?.lineContentNewTaskCheck(editor,view)
					}
					this.syncLock = false
					this.saveSettings()
	
				}catch(error){
					console.error(`An error occurred while check new task in line: ${error.message}`);
					this.syncLock = false
				}
			}

			if (evt.key === "Delete" || evt.key === "Backspace" || evt.key === "Del") {
				if(initialSyncIsLocked){
					return
				}
				try {
					if (!(this.checkModuleClass())) {
						return
					}
					if (!await this.checkAndHandleSyncLock()) return;
					const file_path = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path
					if (file_path) {
						await this.todoistSync?.deletedTaskCheck(file_path);
					}
					this.syncLock = false;
					this.saveSettings()
				} catch (error) {
					console.error(`An error occurred while deleting tasks: ${error}`);
					this.syncLock = false
				}

			}
		});

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
			if (!this.settings.apiInitialized) {
				return
			}
			if (this.app.workspace.activeEditor?.editor?.hasFocus()) {
				this.lineNumberCheck()
			}
			else {
				//
			}

			const target = evt.target as HTMLInputElement;

			if (target.type === "checkbox") {
				if (!(this.checkModuleClass())) {
					return
				}
				this.checkboxEventhandle(evt)
				//this.todoistSync.fullTextModifiedTaskCheck()

			}

		});

		//hook editor-change 事件，如果当前line包含 #todoist,说明有new task
		this.registerEvent(this.app.workspace.on('editor-change',async (editor,view:MarkdownView)=>{
			// TODO for some reason, in some cases, without this wait, the task is deleted just after the task is created. Still didnt found why
			await new Promise(resolve => setTimeout(resolve, 10000));
			try{
				if(!this.settings.apiInitialized){
					return
				}
	
				this.lineNumberCheck()
				if(!(this.checkModuleClass())){
					return
				}
				if(this.settings.enableFullVaultSync){
					return
				}
				if (!await this.checkAndHandleSyncLock()) return;
				await this.todoistSync?.lineContentNewTaskCheck(editor,view)
				this.syncLock = false
				this.saveSettings()

			}catch(error){
				console.error(`An error occurred while check new task in line: ${error.message}`);
				this.syncLock = false
			}

		}))

		//监听 rename 事件,更新 task data 中的 path
		this.registerEvent(this.app.vault.on('rename', async (file, oldpath) => {
			if (!this.settings.apiInitialized) {
				return
			}
			//读取frontMatter
			//const frontMatter = await this.fileOperation.getFrontMatter(file)
			const frontMatter = await this.cacheOperation?.getFileMetadata(oldpath)
			if (frontMatter === null || frontMatter.todoistTasks === undefined) {
				return
			}
			if (!(this.checkModuleClass())) {
				return
			}
			await this.cacheOperation?.updateRenamedFilePath(oldpath, file.path)
			this.saveSettings()

			//update task description
			if (!await this.checkAndHandleSyncLock()) return;
			try {
				await this.todoistSync?.updateTaskDescription(file.path)
			} catch (error) {
				console.error('An error occurred in updateTaskDescription:', error);
			}
			this.syncLock = false;

		}));


		//Listen for file modified events and execute fullTextNewTaskCheck
		this.registerEvent(this.app.vault.on('modify', async (file) => {
			try {
				if (!this.settings.apiInitialized) {
					return
				}
				const filepath = file.path

				//get current view

				const activateFile = this.app.workspace.getActiveFile()

				//To avoid conflicts, Do not check files being edited
				if (activateFile?.path == filepath) {
					return
				}

				if (!await this.checkAndHandleSyncLock()) return;

				await this.todoistSync?.fullTextNewTaskCheck(filepath)
				this.syncLock = false;
			} catch (error) {
				console.error(`An error occurred while modifying the file: ${error.message}`);
				this.syncLock = false
				// You can add further error handling logic here. For example, you may want to 
				// revert certain operations, or alert the user about the error.
			}
		}));

		this.registerInterval(window.setInterval(async () => await this.scheduledSynchronization(), this.settings.automaticSynchronizationInterval * 1000));

		this.app.workspace.on('active-leaf-change', (leaf) => {
			this.setStatusBarText()
		})


		// set default  project for Todoist task in the current file
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'set-default-project-for-todoist-task-in-the-current-file',
			name: 'Set default project for Todoist task in the current file',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view) {
					return
				}
				let filepath
				if (view.file) {
					filepath = view.file.path
					new SetDefalutProjectInTheFilepathModal(this.app, this, filepath)
				}

			}
		});

		// Adds an edito command to trigger the manual sync.
		this.addCommand({
			id: 'asts-trigger-manual-sync',
			name: 'Trigger the Manual Sync',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if(!view) {
					return
				}
				// let filepath
				if(view.file) {
					// filepath = view.file.path
					if(!this.settings.apiInitialized) {
						new Notice('Please set the Todoist api first')
						return
					}
					try{
						this.scheduledSynchronization()
						this.syncLock = false
					}
					catch(error) {
						new Notice(`An error occurred while syncing.:${error}`)
						this.syncLock = false
					}
				}
			}
		})

		//display default project for the current file on status bar
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBar = this.addStatusBarItem();


	}


	async onunload() {
		await this.saveSettings()

	}

	async loadSettings() {
		try {
			const data = await this.loadData();
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
			return true; // 返回 true 表示设置加载成功
		} catch (error) {
			console.error('Failed to load data:', error);
			return false; // 返回 false 表示设置加载失败
		}
	}

	async saveSettings() {
		try {
			// 验证设置是否存在且不为空
			if (this.settings && Object.keys(this.settings).length > 0) {
				await this.saveData(this.settings);
			} else {
				console.error('Settings are empty or invalid, not saving to avoid data loss.');
			}
		} catch (error) {
			// 打印或处理错误
			console.error('Error saving settings:', error);
		}
	}

	async modifyTodoistAPI(api: string) {
		await this.initializePlugin()
	}

	// return true of false
	async initializePlugin() {

		//initialize Todoist restapi 
		this.todoistRestAPI = new TodoistRestAPI(this.app, this)

		//initialize data read and write object
		this.cacheOperation = new CacheOperation(this.app, this)
		const isProjectsSaved = await this.cacheOperation.saveProjectsToCache()

		const isSectionsSaved = await this.cacheOperation.saveSectionsToCache()



		if (!isProjectsSaved || !isSectionsSaved) {
			this.todoistRestAPI = undefined
			this.todoistSyncAPI = undefined
			this.taskParser = undefined
			this.taskParser = undefined
			this.cacheOperation = undefined
			this.fileOperation = undefined
			this.todoistSync = undefined
			new Notice(`Another Simple Todoist Sync plugin initialization failed, please check the Todoist api`)
			return;
		}

		if (!this.settings.initialized) {

			//创建备份文件夹备份todoist 数据
			try {
				//第一次启动插件，备份todoist 数据
				this.taskParser = new TaskParser(this.app, this)

				//initialize file operation
				this.fileOperation = new FileOperation(this.app, this)

				//initialize todoisy sync api
				this.todoistSyncAPI = new TodoistSyncAPI(this.app, this)

				//initialize Todoist sync module
				this.todoistSync = new TodoistSync(this.app, this)

				//每次启动前备份所有数据
				this.todoistSync.backupTodoistAllResources()

			} catch (error) {
				console.log(`error creating user data folder: ${error}`)
				new Notice(`error creating user data folder`)
				return;
			}


			//初始化settings
			this.settings.initialized = true
			this.saveSettings()
			new Notice(`Another Simple Todoist Sync initialization successful. Todoist data has been backed up.`)

		}


		this.initializeModuleClass()


		//get user plan resources
		//const rsp = await this.todoistSyncAPI.getUserResource()
		this.settings.apiInitialized = true
		this.syncLock = false
		new Notice(`Another Simple Todoist Sync loaded successfully.`)
		return true



	}

	async initializeModuleClass() {

		//initialize Todoist restapi 
		this.todoistRestAPI = new TodoistRestAPI(this.app, this)

		//initialize data read and write object
		this.cacheOperation = new CacheOperation(this.app, this)
		this.taskParser = new TaskParser(this.app, this)

		//initialize file operation
		this.fileOperation = new FileOperation(this.app, this)

		//initialize todoisy sync api
		this.todoistSyncAPI = new TodoistSyncAPI(this.app, this)

		//initialize Todoist sync module
		this.todoistSync = new TodoistSync(this.app, this)


		if(this.settings.debugMode){console.log(`Another Simple Todoist Sync plugin: version ${this.manifest.version} (requires obsidian ${this.manifest.minAppVersion})`);}
	}


	async lineNumberCheck() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		if (view) {
			const cursor = view.app.workspace.getActiveViewOfType(MarkdownView)?.editor.getCursor()
			const line = cursor?.line
			//const lineText = view.editor.getLine(line)
			const fileContent = view.data

			//console.log(line)
			//const fileName = view.file?.name
			const fileName = view.app.workspace.getActiveViewOfType(MarkdownView)?.app.workspace.activeEditor?.file?.name
			const filepath = view.app.workspace.getActiveViewOfType(MarkdownView)?.app.workspace.activeEditor?.file?.path
			if (typeof this.lastLines === 'undefined' || typeof this.lastLines.get(fileName as string) === 'undefined') {
				this.lastLines.set(fileName as string, line as number);
				return
			}

			//console.log(`filename is ${fileName}`)
			if (this.lastLines.has(fileName as string) && line !== this.lastLines.get(fileName as string)) {
				const lastLine = this.lastLines.get(fileName as string)
				// if(this.settings.debugMode){
				// 	console.log('Line changed!', `current line is ${line}`, `last line is ${lastLine}`);
				// }


				// 执行你想要的操作
				const lastLineText = view.editor.getLine(lastLine as number)
				//console.log(lastLineText)
				if (!(this.checkModuleClass())) {
					return
				}
				this.lastLines.set(fileName as string, line as number);
				try {
					if (!await this.checkAndHandleSyncLock()) return;
					await this.todoistSync?.lineModifiedTaskCheck(filepath as string, lastLineText, lastLine as number, fileContent)
					this.syncLock = false;
				} catch (error) {
					console.error(`An error occurred while check modified task in line text: ${error}`);
					this.syncLock = false
				}



			}

		}




	}

	async checkboxEventhandle(evt: MouseEvent) {
		if (!(this.checkModuleClass())) {
			return
		}
		const target = evt.target as HTMLInputElement;

		const taskElement = target.closest("div");    //使用 evt.target.closest() 方法寻找特定的父元素，而不是直接访问事件路径中的特定索引
		//console.log(taskElement)
		if (!taskElement) return;
		const regex = /\[tid:: (\d+)\]/; // 匹配 [todoist_id:: 数字] 格式的字符串
		// const regex = /\[todoist_id:: (\d+)\]/; // 匹配 [todoist_id:: 数字] 格式的字符串
		const match = taskElement.textContent?.match(regex) || false;
		if (match) {
			const taskId = match[1];
			//console.log(taskId)
			//const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (target.checked) {
				this.todoistSync?.closeTask(taskId);
			} else {
				this.todoistSync?.repoenTask(taskId);
			}
		} else {
			//console.log('未找到 todoist_id');
			//开始全文搜索，检查status更新
			try {
				if (!await this.checkAndHandleSyncLock()) return;
				const file_path = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path
				if (file_path) {
					await this.todoistSync?.fullTextModifiedTaskCheck(file_path)
				}
				this.syncLock = false;
			} catch (error) {
				console.error(`An error occurred while check modified tasks in the file: ${error}`);
				this.syncLock = false;
			}

		}
	}

	//return true
	checkModuleClass() {
		if (this.settings.apiInitialized === true) {
			if (this.todoistRestAPI === undefined || this.todoistSyncAPI === undefined || this.cacheOperation === undefined || this.fileOperation === undefined || this.todoistSync === undefined || this.taskParser === undefined) {
				this.initializeModuleClass()
			}
			return true
		}
		else {
			new Notice(`Please enter the correct Todoist API token"`)
			return (false)
		}


	}

	async setStatusBarText() {
		if (!(this.checkModuleClass())) {
			return
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		if (!view) {
			this.statusBar.setText('');
		}
		else {

			const filepath = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path

			if (filepath === undefined) {
				return
			}
			const defaultProjectName = await this.cacheOperation?.getDefaultProjectNameForFilepath(filepath as string)
			if (defaultProjectName === undefined) {
				return
			}
			this.statusBar.setText(defaultProjectName)
		}

	}

	async scheduledSynchronization() {
		if (!(this.checkModuleClass())) {
			return;
		}
		
		{{console.log("Todoist scheduled synchronization task started at", new Date().toLocaleString());}}
		try {
			if (!await this.checkAndHandleSyncLock()) return;
			try {
				await this.todoistSync?.syncTodoistToObsidian();
			} catch (error) {
				console.error('An error occurred in syncTodoistToObsidian:', error);
			}
			this.syncLock = false;
			try {
				await this.saveSettings();
			} catch (error) {
				console.error('An error occurred in saveSettings:', error);
			}

			// Sleep for 5 seconds
			await new Promise(resolve => setTimeout(resolve, 5000));

			const filesToSync = this.settings.fileMetadata;

			for (const fileKey in filesToSync) {
				if (!await this.checkAndHandleSyncLock()) return;
				try {
					await this.todoistSync?.fullTextNewTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in fullTextNewTaskCheck:', error);
				}
				this.syncLock = false;

				if (!await this.checkAndHandleSyncLock()) return;
				try {
					await this.todoistSync?.deletedTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in deletedTaskCheck:', error);
				}
				this.syncLock = false;

				if (!await this.checkAndHandleSyncLock()) return;
				try {
					await this.todoistSync?.fullTextModifiedTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in fullTextModifiedTaskCheck:', error);
				}
				this.syncLock = false;
			}

		} catch (error) {
			console.error('An error occurred:', error);
			new Notice('An error occurred:', error);
			this.syncLock = false;
		}
		console.log("Todoist scheduled synchronization task completed at", new Date().toLocaleString());
	}

	async checkSyncLock() {
		let checkCount = 0;
		while (this.syncLock == true && checkCount < 10) {
			await new Promise(resolve => setTimeout(resolve, 1000));
			checkCount++;
		}
		if (this.syncLock == true) {
			return false;
		}
		return true;
	}

	async checkAndHandleSyncLock() {
		if (this.syncLock) {
			const isSyncLockChecked = await this.checkSyncLock();
			if (!isSyncLockChecked) {
				return false;
			}
		}
		this.syncLock = true;
		return true;
	}

}




