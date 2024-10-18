import { App, TFile } from 'obsidian';
import AnotherSimpleTodoistSync from "../main";
export class FileOperation   {
	app:App;
    plugin: AnotherSimpleTodoistSync;


	constructor(app:App, plugin:AnotherSimpleTodoistSync) {
		this.app = app;
        this.plugin = plugin;

	}

     // Complete a task to mark it as completed
    async completeTaskInTheFile(taskId: string) {

        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path
    
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)

        // Check if the returned file is a TFile
        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
 
        const lines = content.split('\n')
        let modified = false
    
        for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes(taskId) && this.plugin.taskParser?.hasTodoistTag(line)) {
            lines[i] = line.replace('[ ]', '[x]')
            modified = true
            break
        }
        }
    
        if (modified) {
        const newContent = lines.join('\n')
        await this.app.vault.modify(file, newContent)
        }
    }
  
    // uncheck Completed tasks，
    async uncompleteTaskInTheFile(taskId: string) {
        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path
    
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // Check if the returned file is a TFile
        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
 
        const lines = content.split('\n')
        let modified = false
    
        for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes(taskId) && this.plugin.taskParser?.hasTodoistTag(line)) {
            lines[i] = line.replace(/- \[(x|X)\]/g, '- [ ]');
            modified = true
            break
        }
        }
    
        if (modified) {
        const newContent = lines.join('\n')
        await this.app.vault.modify(file, newContent)
        }
    }

    //add #todoist at the end of task line, if full vault sync enabled
    async addTodoistTagToFile(filepath: string) {    
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // Check if the returned file is a TFile
        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
    
        const lines = content.split('\n')
        let modified = false
    
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if(!this.plugin.taskParser?.isMarkdownTask(line)){
                //console.log(line)
                console.log("It is not a markdown task.")
                continue;
            }
            //if content is empty
            if(this.plugin.taskParser?.getTaskContentFromLineText(line) == ""){
                console.log("Line content is empty")
                continue;
            }
            if (!this.plugin.taskParser?.hasTodoistId(line) && !this.plugin.taskParser?.hasTodoistTag(line)) {
                const newLine = this.plugin.taskParser?.addTodoistTag(line);
                lines[i] = newLine
                modified = true
            }
        }
        
        if (modified) {
            console.log(`New task found in files ${filepath}`)
            const newContent = lines.join('\n')
            //console.log(newContent)
            await this.app.vault.modify(file, newContent)

            //update filemetadate
            const metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath)
            if(!metadata){
                await this.plugin.cacheOperation?.newEmptyFileMetadata(filepath)
            }

        }
    }



    //add todoist at the line
    async addTodoistLinkToFile(filepath: string) {    
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // Check if the returned file is a TFile
        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
    
        const lines = content.split('\n')
        let modified = false
    
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (this.plugin.taskParser?.hasTodoistId(line) && this.plugin.taskParser?.hasTodoistTag(line)) {
                if(this.plugin.taskParser && this.plugin.taskParser?.hasTodoistLink(line)){
                    if(this.plugin.settings.debugMode){console.log(`Todoist link already exists in line: ${line}`)}
                    return
                }
                if(this.plugin.settings.debugMode){console.log(`Content for line is: ${line}`)}
                //console.log('prepare to add todoist link')
                const taskID = this.plugin.taskParser?.getTodoistIdFromLineText(line)
                const taskObject = this.plugin.cacheOperation?.loadTaskFromCacheyID(taskID)
                const todoistLink = taskObject.url
                const link = `[link](${todoistLink})`
                const newLine = this.plugin.taskParser?.addTodoistLink(line,link)
                if(this.plugin.settings.debugMode){console.log(`Content for newLine is: ${newLine}`)}
                lines[i] = newLine
                modified = true
            }else{
                continue
            }
        }
        
        if (modified) {
            const newContent = lines.join('\n')
            //console.log(newContent)
            await this.app.vault.modify(file, newContent)



        }
    }


        //add #todoist at the end of task line, if full vault sync enabled
    async addTodoistTagToLine(filepath:string,lineText:string,lineNumber:number,fileContent:string) {    
        // 获取文件对象并更新内容
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // const content = fileContent
        // Check if the returned file is a TFile
        let content
        if(file instanceof TFile){
            content = fileContent
        }else{
            return
        }
    
        const lines = content.split('\n')
        let modified = false

        const line = lineText
        if(!this.plugin.taskParser?.isMarkdownTask(line)){
            //console.log(line)
            //console.log("It is not a markdown task.")
            return;
        }
        //if content is empty
        if(this.plugin.taskParser?.getTaskContentFromLineText(line) == ""){
            //console.log("Line content is empty")
            return;
        }
        if (!this.plugin.taskParser?.hasTodoistId(line) && !this.plugin.taskParser?.hasTodoistTag(line)) {
            //console.log(line)
            //console.log('prepare to add todoist tag')
            const newLine = this.plugin.taskParser?.addTodoistTag(line);
            //console.log(newLine)
            lines[lineNumber] = newLine
            modified = true
        }
        
        
        if (modified) {
            console.log(`New task found in files ${filepath}`)
            const newContent = lines.join('\n')
            console.log(newContent)
            await this.app.vault.modify(file, newContent)

            //update filemetadate
            const metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath)
            if(!metadata){
                await this.plugin.cacheOperation?.newEmptyFileMetadata(filepath)
            }

        }
    }

    // sync updated task content  to file
    async syncUpdatedTaskContentToTheFile(evt:{object_id:string,extra_data:{content:string}}) {
        const taskId = evt.object_id
        // 获取任务文件路径
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path
    
        // 获取文件对象并更新内容
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // const content = await this.app.vault.read(file)

        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
    
        const lines = content.split('\n')
        let modified = false
    
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTodoistTag(line)) {
                const oldTaskContent = this.plugin.taskParser?.getTaskContentFromLineText(line)
                const newTaskContent = evt.extra_data.content

                lines[i] = line.replace(oldTaskContent, newTaskContent)
                modified = true
                break
            }
        }
    
        if (modified) {
        const newContent = lines.join('\n')
        //console.log(newContent)
        await this.app.vault.modify(file, newContent)
        }
        
    }

    // sync updated task due date  to the file
    async syncUpdatedTaskDueDateToTheFile(evt:{object_id:string,extra_data:{due_date:string}}) {
        const taskId = evt.object_id
        
        if (this.plugin.settings.debugMode){console.log("The taskID evt object value is: " + JSON.stringify(evt))}
        

        // 获取任务文件路径
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path
    
        // 获取文件对象并更新内容
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // const content = await this.app.vault.read(file)
        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
    
        const lines = content.split('\n')
        let modified = false
    
        for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (line.includes(taskId) && this.plugin.taskParser?.hasTodoistTag(line)) {
            const lineTaskDueDate = this.plugin.taskParser?.getDueDateFromLineText(line) || ""
            const newTaskDueDate = this.plugin.taskParser?.ISOStringToLocalDateString(evt.extra_data.due_date) || ""

            
            const lineTaskTime = this.plugin.taskParser?.getDueTimeFromLineText(line) || ""
            
            const newTaskTime = this.plugin.taskParser?.ISOStringToLocalClockTimeString(evt.extra_data.due_date) || ""
            // TODO needs to consider what to do when the task doesn't have time
            // TODO how to handle when the task has the new "timeslot" with start + finish time?
            // TODO 'trimmedlineTaskDueDate' looks just for the date, removing any other information, like hour. This very likely will break some dates sometimes, need a more inteligent solution
            const trimmedlineTaskDueDate = lineTaskDueDate.slice(0,10)

            // if(this.plugin.settings.debugMode){
            //             console.log(`lineTaskDueDate: ${lineTaskDueDate} and newTaskDueDate: ${newTaskDueDate}`)
            //             console.log(`lineTaskTime: ${lineTaskTime} and newTaskTime: ${newTaskTime}`)
            // }
 
            if(this.plugin.taskParser && lineTaskDueDate === ""){
                if(this.plugin.settings.debugMode){console.log("Task doesn't have a due date, it will attempt to add one.")}
                lines[i] = this.plugin.taskParser?.insertDueDateBeforeTodoist(line,newTaskDueDate)
                modified = true
            }

            else if(newTaskDueDate === ""){
                //remove 日期from text
                const regexRemoveDate = /(🗓️|📅|📆|🗓|@)\s?\d{4}-\d{2}-\d{2}/; //匹配日期🗓️2023-03-07"
                lines[i] = line.replace(regexRemoveDate,"")
                modified = true
            }
            else if(newTaskDueDate !== trimmedlineTaskDueDate){
                lines[i] = line.replace(trimmedlineTaskDueDate, newTaskDueDate)
                modified = true
            }
            
            // TODO when a task is created without dueTime, while trying to convert from ISO to local time, it will return 23:59, which is not the best option. So for now this will work
            else if(lineTaskTime === "" && newTaskTime !== "" && newTaskTime !== "23:59"){
                const newDateWithTime = newTaskDueDate + " ⏰" + newTaskTime;
                lines[i] = line.replace(newTaskDueDate,newDateWithTime)
                modified = true
            }

            else if(lineTaskTime !== newTaskTime && newTaskTime !== "23:59"){
                lines[i] = line.replace(lineTaskTime,newTaskTime)
                modified = true
            }

            

            break
        }
        }
    
        if (modified) {
        const newContent = lines.join('\n')
        //console.log(newContent)
        await this.app.vault.modify(file, newContent)
        }
        
    }


    // sync new task note to file
    async syncAddedTaskNoteToTheFile(evt:{parent_item_id:string,event_date:string,extra_data:{content:string,event_date:string}}) {


        if (this.plugin.settings.debugMode) {
            console.log("This is the evt object value: " + JSON.stringify(evt))
        }

        const taskId = evt.parent_item_id
        const note = evt.extra_data.content
        const datetime = this.plugin.taskParser?.ISOStringToLocalDatetimeString(evt.event_date)
        // 获取任务文件路径
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path
    
        // 获取文件对象并更新内容
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // const content = await this.app.vault.read(file)
        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
    
        const lines = content.split('\n')
        let modified = false
    
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTodoistTag(line)) {
                const indent = '\t'.repeat(line.length - line.trimStart().length + 1);
                const noteLine = `${indent}- ${datetime} ${note}`;
                lines.splice(i + 1, 0, noteLine);
                modified = true
                break
            }
        }
    
        if (modified) {
            if(this.plugin.settings.commentsSync){
                if (this.plugin.settings.debugMode){console.log("New comments from the task " + taskId)}
                
                const newContent = lines.join('\n')
                //console.log(newContent)
                await this.app.vault.modify(file, newContent)
            }
            else {
                if (this.plugin.settings.debugMode){console.log("There is new comments on task " + taskId + " but those were not added because the commentsSync settings is disabled.")}
            }

        }
        
    }


    //避免使用该方式，通过view可以获得实时更新的value
    async readContentFromFilePath(filepath:string){
        try {
            const file = this.app.vault.getAbstractFileByPath(filepath);
            // const content = await this.app.vault.read(file);
            let content
            if(file instanceof TFile){
                content = await this.app.vault.read(file)
            }else{
                return
            }
            return content
        } catch (error) {
            console.error(`Error loading content from ${filepath}: ${error}`);
            return false;
        }
    }

    //get line text from file path
    //Please use view.editor.getLine，read Method has delay
    async getLineTextFromFilePath(filepath:string,lineNumber:number) {

        const file = this.app.vault.getAbstractFileByPath(filepath)
        // const content = await this.app.vault.read(file)
        let content
        if(file instanceof TFile){
            content = await this.app.vault.read(file)
        }else{
            return
        }
    
        const lines = content.split('\n')
        return(lines[lineNumber])
    }
  
    //search todoist_id by content
    async searchTodoistIdFromFilePath(filepath: string, searchTerm: string): Promise<string | null> {
        const file = this.app.vault.getAbstractFileByPath(filepath)
        // const fileContent = await this.app.vault.read(file)
        // const content = await this.app.vault.read(file);
        let fileContent
        if(file instanceof TFile){
            fileContent = await this.app.vault.read(file)
        }else{
            fileContent = ""
        }
        const fileLines = fileContent.split('\n');
        let todoistId: string | null = null;
    
        for (let i = 0; i < fileLines.length; i++) {
        const line = fileLines[i];
    
        if (line.includes(searchTerm)) {
            // const regexResult = /\[todoist_id::\s*(\w+)\]/.exec(line);
            const regexResult = /\[tid::\s*(\w+)\]/.exec(line);
    
            if (regexResult) {
            todoistId = regexResult[1];
            }
    
            break;
        }
        }
    
        return todoistId;
    }

    //get all files in the vault
    async getAllFilesInTheVault(){
        const files = this.app.vault.getFiles()
        return(files)
    }

    //search filepath by taskid in vault
    async searchFilepathsByTaskidInVault(taskId:string){
        console.log(`preprare to search task ${taskId}`)
        const files = await this.getAllFilesInTheVault()
        //console.log(files)
        const tasks = files.map(async (file) => {
            if (!this.isMarkdownFile(file.path)) {
                return;
            }
            const fileContent = await this.app.vault.cachedRead(file);
            if (fileContent.includes(taskId)) {
                return file.path;
            }
        });
    
        const results = await Promise.all(tasks);
        const filePaths = results.filter((filePath) => filePath !== undefined);
        return filePaths[0] || null;
        //return filePaths || null
    }


    isMarkdownFile(filename:string) {
        // 获取文件名的扩展名
        let extension = filename.split('.').pop();
      
        // 将扩展名转换为小写（Markdown文件的扩展名通常是.md）
        extension = extension?.toLowerCase();
      
        // 判断扩展名是否为.md
        if (extension === 'md') {
          return true;
        } else {
          return false;
        }
      }





}
