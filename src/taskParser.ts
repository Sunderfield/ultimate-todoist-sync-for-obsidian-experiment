import AnotherSimpleTodoistSync from "../main";
import { App } from 'obsidian';


export class TaskParser {
    app: App;
    plugin: AnotherSimpleTodoistSync;

    constructor(app: App, plugin: AnotherSimpleTodoistSync) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
    }




    //convert line text to a task object
    async convertTextToTodoistTaskObject(lineText: string, filepath: string, lineNumber?: number, fileContent?: string) {
        //console.log(`linetext is:${lineText}`)

        let hasParent = false
        let parentId = null
        let parentTaskObject = null
        let textWithoutIndentation = lineText
        // TODO need to remove any empty spaces from the task
        // console.log(`textwithoutindentation is ${textWithoutIndentation}`)
        if (this.getTabIndentation(lineText) > 0) {
            textWithoutIndentation = this.removeTaskIndentation(lineText)
            const lines = fileContent?.split('\n') || ""

            for (let i = (Number(lineNumber) - 1); i >= 0; i--) {
                const line = lines[i]
                if (this.isLineBlank(line)) {
                    break
                }
                if (this.getTabIndentation(line) >= this.getTabIndentation(lineText)) {
                    //console.log(`缩进为 ${this.getTabIndentation(line)}`)
                    continue
                }
                if ((this.getTabIndentation(line) < this.getTabIndentation(lineText))) {
                    //console.log(`缩进为 ${this.getTabIndentation(line)}`)
                    if (this.hasTodoistId(line)) {
                        parentId = this.getTodoistIdFromLineText(line)
                        hasParent = true
                        //console.log(`parent id is ${parentId}`)
                        parentTaskObject = this.plugin.cacheOperation?.loadTaskFromCacheyID(parentId)
                        break
                    }
                    else {
                        break
                    }
                }
            }


        }

        const dueDate = this.getDueDateFromLineText(textWithoutIndentation)
        const dueTime = this.getDueTimeFromLineText(textWithoutIndentation)
        const labels = this.getAllTagsFromLineText(textWithoutIndentation)
        const section = this.getFirstSectionFromLineText(textWithoutIndentation)
        let sectionId

        // TODO this will get the task duration
        // TODO need to add duration only if the task has a duration
        const durationTime = Number(this.getTaskDurationFromLineText(textWithoutIndentation))
        // TODO the API can also accept "day" 
        const durationUnit = "minute"

        const hasDuration = this.hasDuration(textWithoutIndentation);





        //dataview format metadata
        //const projectName = this.getProjectNameFromLineText(textWithoutIndentation) ?? this.plugin.settings.defaultProjectName
        //const projectId = await this.plugin.cacheOperation.getProjectIdByNameFromCache(projectName)
        //use tag as project name

        let projectId = this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(filepath as string)
        // let projectName = this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId)


        // If the task has seection, it tries to retrieve from cache, if don't find, create a new one and store it on cache.
        if (section) {
            const hasSectionOnCache = this.plugin.cacheOperation?.checkIfSectionExistOnCache(section, projectId)
            if (hasSectionOnCache) {
                sectionId = hasSectionOnCache
            }
            if (!hasSectionOnCache) {
                // TODO creates the section on Todoist and add to the cache then assign the sectionId to the sectionID
                const newSection = await this.plugin.todoistRestAPI?.CreateNewSection(section, projectId)
                sectionId = newSection?.id
                if (newSection) {
                    this.plugin.cacheOperation?.addSectionToCache(section, newSection?.id, projectId)
                }

            }
        }

        if (hasParent) {
            projectId = parentTaskObject.projectId
            // projectName =this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId)
        }
        if (!hasParent && labels) {
            //匹配 tag 和 peoject
            for (const label of labels) {

                //console.log(label)
                const labelName = label.replace(/#/g, "");
                // console.log("labelName value = " + labelName)
                const hasProjectId = this.plugin.cacheOperation?.getProjectIdByNameFromCache(labelName)
                if (!hasProjectId) {
                    continue
                }
                // projectName = labelName
                //console.log(`project is ${projectName} ${label}`)
                projectId = hasProjectId
                break
            }
        }


        let content = this.getTaskContentFromLineText(textWithoutIndentation)
        if (content === "") {
            // We use the obsidian's note as default task content
            content = filepath.replace(/^.*[\\/]/, '').replace(".md", "");
        }
        const isCompleted = this.isTaskCheckboxChecked(textWithoutIndentation)
        let description = ""
        const todoist_id = this.getTodoistIdFromLineText(textWithoutIndentation)
        const priority = this.getTaskPriority(textWithoutIndentation)

        if (filepath) {
            const url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`)
            description = `[${filepath}](${url})`;
        }

        const todoistTask: any = {
            projectId: projectId,
            content: content || '',
            parentId: parentId || null,
            dueDate: dueDate || '',
            dueTime: dueTime || '',
            labels: labels || [],
            description: description,
            isCompleted: isCompleted,
            todoist_id: todoist_id || null,
            hasParent: hasParent,
            priority: priority
        };
        //console.log(`converted task `)

        if (hasDuration) {
            todoistTask["duration"] = durationTime
            todoistTask["duration_unit"] = durationUnit
        }

        // If it has a section, add the sectionId to the task
        // TODO is failing on the first try because it doesn't have the ID yet. maybe handle with just the update later?
        if (section) {
            todoistTask["sectionId"] = sectionId
        }
        return todoistTask;
    }

    keywords_function(text: string) {
        if (text === "TODOIST_TAG") {

            const customSyncTagValue = this.plugin.settings.customSyncTag;

            // if(this.plugin.settings.debugMode){console.log("customSyncTag value: " + customSyncTagValue)}


            return customSyncTagValue
        }
        if (text === "DUE_DATE") {
            if (this.plugin.settings.alternativeKeywords) {
                return "🗓️|📅|📆|🗓|@"
            } else {
                return "🗓️|📅|📆|🗓"
            }
        }
        // TODO add keywords for duration
        if (text === "DURATION") {
            if (this.plugin.settings.alternativeKeywords) {
                return "⏳|&"
            } else {
                return "⏳"
            }
        }
        if (text === "DUE_TIME") {
            if (this.plugin.settings.alternativeKeywords) {
                return "⏰|⏲|\\$"
            } else {
                return "⏰|⏲"
            }
        } else {
            return "No such keyword"
        }

    }

    //   Return true or false if the text has a todoist tag
    hasTodoistTag(text: string) {

        const regex_test = new RegExp(`^[\\s]*[-] \\[[x ]\\] [\\s\\S]*${this.keywords_function("TODOIST_TAG")}[\\s\\S]*$`, "i");

        // console.log("Value of regex_test = " + regex_test)

        return (regex_test.test(text))

    }

    // Return true/false if the text has a duration
    hasDuration(text: string) {
        const regex_test = new RegExp(`(${this.keywords_function("DURATION")})\\d+min`);
        return (regex_test.test(text))
    }


    //   Return true or false if the text has a todoist id
    hasTodoistId(text: string) {
        if (text === "") {
            return null
        } else {

            const regex_tag_test = new RegExp(/%%\[tid:: \[(\d+)\]\(https:\/\/app.todoist.com\/app\/task\/(\d+)\)\]%%/).test(text)


            return (regex_tag_test)
        }
    }

    //   Return true or false if the text has a due date
    hasDueDate(text: string) {
        const regex_test = new RegExp(`(${this.keywords_function("DUE_DATE")})\\s?\\d{4}-\\d{2}-\\d{2}`);

        return (regex_test.test(text))
    }


    // Get the due date from the text
    getDueDateFromLineText(text: string) {

        const regex_test = new RegExp(`(?:${this.keywords_function("DUE_DATE")})\\s?(\\d{4}-\\d{2}-\\d{2})`);

        const due_date = regex_test.exec(text);

        if (due_date === null) {
            return null;
        }

        // Return the due date value without the emoji
        return due_date[1]
    }

    // Get the task duration from the text
    getTaskDurationFromLineText(text: string) {
        const regex_text = new RegExp(`(?:${this.keywords_function("DURATION")})\\d+min`);
        const extract_duration = regex_text.exec(text)?.toString();
        const extract_duration_number = Number(extract_duration?.match(/\d+/g))

        if (extract_duration_number === null) {
            return null
        }
        if (extract_duration_number && extract_duration_number > 1440) {
            console.log("The duration is more than 24 hours. It will be ignored.")
            return null
        } else {
            return extract_duration_number
        }


    }

    transformDurationToObject(text: number) {
        const amount = text;
        const unit = "minute";

        const duration_object = { duration: { amount: amount, unit: unit } }

        return duration_object
    }

    // Get the duetime from the text
    getDueTimeFromLineText(text: string) {

        const regex_search_for_duetime = new RegExp(`(?:${this.keywords_function("DUE_TIME")})\\s?(\\d{2}:\\d{2})`);
        // TODO need to handle single duetime. e.g: 7:33 instead of 07:33. It returns null for 07:33

        const current_time = regex_search_for_duetime.exec(text);

        if (current_time) {
            if (Number(current_time[1].slice(0, 2)) > 24 || Number(current_time[1].slice(3, 5)) > 59) {
                // TODO when it defaults the reminder time, it needs to change the text on Obsidian to reflect that
                return false
            }
            return current_time[1]
        }
        else {
            // TODO Needs to find a better solution, because when it converts to UTC it can change the date, which create a loop of updates
            return false
        }

    }

    // TODO Implement the project based on project::<value>
    // //   Get the project name from the text
    //     getProjectNameFromLineText(text:string){
    //         const result = REGEX.PROJECT_NAME.exec(text);
    //         return result ? result[1] : null;
    //     }

    //   Get the todoist id from the text
    getTodoistIdFromLineText(text: string) {
        // if(this.plugin.settings.debugMode){console.log(`getTodoistIdFromLineText text is ${text}`)}

        const regex_todoist_id = /\[tid::\s*\[\d+\]\(/
        const search_for_tid_id = regex_todoist_id.exec(text)

        if (search_for_tid_id === null) { return null }
        const strip_tid_for_number_id = search_for_tid_id.toString().replace(/\D/g, "")


        // console.log(`getTodoistIdFromLineText result is ${search_for_tid_id}`)
        // console.log(`strip_tid_for_number_id: ${strip_tid_for_number_id}`)
        // return result ? result[1] : null;

        return strip_tid_for_number_id ? strip_tid_for_number_id : null;
    }

    // get the duedate from dataview
    getDueDateFromDataview(dataviewTask: { due?: string }) {
        if (!dataviewTask.due) {
            return ""
        }
        else {
            const dataviewTaskDue = dataviewTask.due.toString().slice(0, 10)
            return (dataviewTaskDue)
        }

    }


    //   Remove everything that is not the task content
    getTaskContentFromLineText(lineText: string) {

        const regex_remove_rules =
        {
            remove_priority: /\s!!([1-4])\s/,
            remove_tags: /(^|\s)(#[\w\d\u4e00-\u9fa5-]+)/g,
            remove_space: /^\s+|\s+$/g,
            remove_date: new RegExp(`((🗓️|📅|📆|🗓|@)\\s?\\d{4}-\\d{2}-\\d{2})`),
            remove_time: new RegExp(`((⏰|⏲|\\$)\\s?\\d{2}:\\d{2})`),
            remove_inline_metada: /%%\[\w+::\s*\w+\]%%/,
            remove_checkbox: /^(-|\*)\s+\[(x|X| )\]\s/,
            remove_checkbox_with_indentation: /^([ \t]*)?(-|\*)\s+\[(x|X| )\]\s/,
            // REMOVE_TODOIST_LINK: /\[link\]\(.*?\)/,
            remove_todoist_tid_link: /%%\[tid::\s*\[\d+\]\(https:\/\/app.todoist\.com\/app\/task\/\d+\)\]%%/,
            remove_todoist_duration: new RegExp(`(⏳|&)\\d+min`),
            remove_todoist_section: /\/\/\/\w*/
        }

        const TaskContent = lineText.replace(regex_remove_rules.remove_inline_metada, "")
            .replace(regex_remove_rules.remove_todoist_tid_link, "")
            .replace(regex_remove_rules.remove_priority, " ") //priority 前后必须都有空格，
            .replace(regex_remove_rules.remove_tags, "")
            .replace(regex_remove_rules.remove_date, "")
            .replace(regex_remove_rules.remove_time, "")
            .replace(regex_remove_rules.remove_checkbox, "")
            .replace(regex_remove_rules.remove_checkbox_with_indentation, "")
            .replace(regex_remove_rules.remove_space, "")
            .replace(regex_remove_rules.remove_todoist_duration, "") //remove duration
            .replace(regex_remove_rules.remove_todoist_section, "") //remove section

        return (TaskContent)
    }


    //get all tags from task text
    getAllTagsFromLineText(lineText: string) {
        const regex_tags_search = /#[\w\u4e00-\u9fa5-]+/g;
        let tags: string[] = lineText.match(regex_tags_search) || [];


        if (tags) {
            // Remove '#' from each tag
            tags = tags.map(tag => tag.replace('#', ''));
        }

        return tags;
    }

    // Get the first match to user as a section
    getFirstSectionFromLineText(linetext: string) {
        const regex_section_search = /\/\/\/\w*/g;
        const section = linetext.match(regex_section_search) || [];

        const section_raw = section.toString().replace("///", "")

        return section_raw
    }

    //get checkbox status
    isTaskCheckboxChecked(lineText: string) {
        const checkbox_status_search = /- \[(x|X)\] /;
        return (checkbox_status_search.test(lineText))
    }


    //task content compare
    taskContentCompare(lineTask: { content: string }, todoistTask: { content: string }) {
        const lineTaskContent = lineTask.content
        //console.log(dataviewTaskContent)

        const todoistTaskContent = todoistTask.content
        //console.log(todoistTask.content)

        // console.log(`lineTaskContent is ${lineTaskContent} and todoistTaskContent is ${todoistTaskContent}`)
        // TODO remove all spaces and compare both strings without any spaces

        const lineContentWithoutSpaces = lineTaskContent.replace(/\s/g, "")
        const todoistContentWithoutSpaces = todoistTaskContent.replace(/\s/g, "")

        // console.log(`lineContentWithoutSpaces is ${lineContentWithoutSpaces} and todoistContentWithoutSpaces is ${todoistContentWithoutSpaces}`)

        if (lineContentWithoutSpaces === todoistContentWithoutSpaces) {
            // console.log("The content on the comparisson is the same")
            // If the content is the same, return true
            return true
        } else {
            // If content is not the same, returns false
            return false
        }

        //content 是否修改
        // const contentModified = (lineTaskContent === todoistTaskContent)
        // return(contentModified)  
    }


    //tag compare
    taskTagCompare(lineTask: { labels: string[] }, todoistTask: { labels: string[] }) {


        const lineTaskTags = lineTask.labels
        //console.log(dataviewTaskTags)

        const todoistTaskTags = todoistTask.labels
        //console.log(todoistTaskTags)

        //content 是否修改
        const tagsModified = lineTaskTags.length === todoistTaskTags.length && lineTaskTags.sort().every((val, index) => val === todoistTaskTags.sort()[index]);
        return (tagsModified)
    }

    //task status compare
    taskStatusCompare(lineTask: { isCompleted: boolean }, todoistTask: { isCompleted: boolean }) {
        //status 是否修改
        const statusModified = (lineTask.isCompleted === todoistTask.isCompleted)
        //console.log(lineTask)
        //console.log(todoistTask)
        return (statusModified)
    }


    //Compare if the due date from Obsidian is the same due date from Todoist
    async compareTaskDueDate(lineTask: { dueDate?: any }, todoistTask: any): Promise<boolean> {


        const lineTaskDue = lineTask.dueDate
        const todoistTaskDue = todoistTask.due;

        let todoistTaskDueDate = "";

        if (todoistTask.due?.date) {
            todoistTaskDueDate = todoistTask.due.date
        }

        // TODO this is stupid, but works for now
        if (lineTaskDue == "\"\"" && todoistTaskDue === null) {
            // This usually happens when a task without date is created, it saves as null on the cache but is a empty string on the lineTask
            return false;
        }


        // if any falue is empty, return false as you can't compare
        if ((lineTaskDue || todoistTaskDueDate) === "") {
            // if(this.plugin.settings.debugMode){console.log("One of the dates had empty values, so the comparison will fail.")}
            return false;
        }

        // if both values are the same, return false because there is no change
        if (lineTaskDue == todoistTaskDueDate) {
            // if(this.plugin.settings.debugMode){console.log('lineTaskDue == todoistTaskDueDate, returning false on compareTaskDueDate')}
            return false;
        }

        // If any has a invvalid date, return false as you can't compare
        else if (lineTaskDue.toString() === "Invalid Date" || todoistTaskDue.toString() === "Invalid Date") {
            // if(this.plugin.settings.debugMode){console.log('invalid date on compareTaskDueDate')}
            return false;
        }
        // If everything above is false, than return true because the dates are different
        else {
            // if(this.plugin.settings.debugMode){console.log('Something is different in the dates, so returning true on compareTaskDueDate')}
            return true;
        }
    }

    // Compare if the due time from Obsidian is the same due time from Todoist
    async compareTaskDueTime(lineTask: { dueTime: string }, todoistTask: { due?: any }): Promise<boolean> {

        // if(this.plugin.settings.debugMode){console.log("compareTaskDueTime started...")}

        const lineTaskDueTime = JSON.stringify(lineTask.dueTime)
        const todoistTaskDue = todoistTask.due ?? "";

        // console.log(`lineTaskDueTime is ${lineTaskDueTime} and todoistTaskDue is ${todoistTaskDue}`)

        // TODO is stupid but works. If the task is created without any date, it saves as empty string on the cache but is a empty string on the lineTask
        if (lineTaskDueTime === "\"\"" && todoistTaskDue === null || todoistTaskDue === "") {
            return false
        }

        const todoistTaskDueTimeLocalClock = JSON.stringify(this.ISOStringToLocalClockTimeString(todoistTaskDue.datetime))

        // if any value is empty, return false as you can't compare
        if ((lineTaskDueTime || todoistTaskDueTimeLocalClock) === "") {
            // if(this.plugin.settings.debugMode){console.log("One of the times had empty values, so the comparison will fail.")}
            return false;
        }

        // if both values are the same, return false because there is no change
        if (lineTaskDueTime == todoistTaskDueTimeLocalClock) {
            // if(this.plugin.settings.debugMode){console.log('lineTaskDueTime == todoistTaskDueTimeLocalClock, returning false on compareTaskDueTime')}
            return false;
        }

        // TODO For some reason the empty DueTime lenght is 2, so I need a better way to check this one in the future
        // If the lineTask is empty and the todoistTask has only the date, return false because both don't have duetime
        if (lineTaskDueTime.length === 2 && todoistTaskDue.string && todoistTaskDue.string.length === 10) {
            // console.log(`The task has no due time and todoisttask object has only the date, not duetime. It will return false because both don't have duetime`)
            return false
        }

        else {
            // if(this.plugin.settings.debugMode){console.log('Something is different in the times, so returning true on compareTaskDueTime')}
            return true;
        }
    }

    async compareTaskDuration(lineTask: { duration: { amount: number } }, todoistTask: { duration: { amount: number } }): Promise<boolean> {

        if (lineTask.duration && todoistTask.duration?.amount === undefined) {
            console.log("The task has a duration, but Todoist does not. It will return true")
            return true
        }

        // If the line duration was removed or updated in Todoist, needs to update on the lineTask as well
        if (lineTask.duration && todoistTask.duration.amount) {
            // TODO it shoudl check if there is a duration on the lineTask, if does not, retrieve the task duration and add it. If it has, check if matches the current duration on Todoist
            const lineTaskDuration = Number(lineTask.duration);
            const todoistCacheTaskDuration = Number(todoistTask.duration.amount);

            if (lineTaskDuration === todoistCacheTaskDuration) {
                // console.log("The task duration is the same. It will return false")
                return false
            } else {
                // console.log("The task duration is different. It will return true")
                return true
            }


        } else {
            return false
        }
    }

    async compareSection(lineTask: { sectionId: string }, todoistTask: { sectionId: string }) {

        const lineTaskSectionName = this.plugin.cacheOperation?.getSectionNameByIdFromCache(lineTask.sectionId)
        const todoistTaskSectionName = this.plugin.cacheOperation?.getSectionNameByIdFromCache(todoistTask.sectionId)

        if (lineTaskSectionName !== todoistTaskSectionName) {
            return true
        } else {
            return false
        }
    }


    //task project id compare
    async taskProjectCompare(lineTask: { projectId: number }, todoistTask: { projectId: number }) {
        //project 是否修改
        //console.log(dataviewTaskProjectId)
        //console.log(todoistTask.projectId)
        return (lineTask.projectId === todoistTask.projectId)
    }



    // Check if the task is indented
    isIndentedTask(text: string) {
        // TASK_INDENTATION: /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/,
        const check_indentation = /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/;

        // if(this.plugin.settings.debugMode){
        //     console.log("Checking if the task is indented. Return value should be: " + check_indentation.test(text))
        // }

        return (check_indentation.test(text));
    }


    //判断制表符的数量
    //console.log(getTabIndentation("\t\t- [x] This is a task with two tabs")); // 2
    //console.log(getTabIndentation("  - [x] This is a task without tabs")); // 0
    getTabIndentation(lineText: string) {
        // TAB_INDENTATION: /^(\t+)/,
        const tab_indentation_search = /^(\t+)/;
        const match = tab_indentation_search.exec(lineText)
        return match ? match[1].length : 0;
    }


    //	Task priority from 1 (for urgent) up to 4 (default priority).
    getTaskPriority(lineText: string): number {

        // It checks with spaces before and after to avoid any strings containing the same values
        const regex_test_priority_rule = new RegExp("\\s!!([1-4])\\s");
        const regex_priority_check = regex_test_priority_rule.exec(lineText);

        function invertPriorityOrder(priority: number) {
            switch (priority) {
                case 1:
                    return 4
                case 2:
                    return 3
                case 3:
                    return 2
                case 4:
                    return 1
            }
        }

        if (regex_priority_check && typeof Number(regex_priority_check[1]) === 'number') {
            const inverted_priority_return = invertPriorityOrder(Number(regex_priority_check[1]))

            return Number(inverted_priority_return)
        }
        else {
            return 1
        }

    }



    //remove task indentation
    removeTaskIndentation(text: string) {
        const regex = /^([ \t]*)?- \[(x| )\] /;
        return text.replace(regex, "- [$2] ");
    }


    //判断line是不是空行
    isLineBlank(lineText: string) {
        // BLANK_LINE: /^\s*$/,
        const blank_line_regex = /^\s*$/;
        return blank_line_regex.test(lineText)
        // return(REGEX.BLANK_LINE.test(lineText))
    }



    //在linetext中插入日期
    insertDueDateBeforeTodoist(text: string, dueDate: string) {
        // const regex = new RegExp(`(${keywords.TODOIST_TAG})`)
        const tag_to_look_for = this.keywords_function("TODOIST_TAG")

        // if(this.plugin.settings.debugMode){console.log(`The tag to look for is: ${tag_to_look_for}`)}

        return text.replace(tag_to_look_for, `📅 ${dueDate} ${tag_to_look_for}`);
    }

    //extra date from obsidian event
    // 使用示例
    //const str = "2023-03-27T15:59:59.000000Z";
    //const dateStr = ISOStringToLocalDateString(str);
    //console.log(dateStr); // 输出 2023-03-27
    ISOStringToLocalDateString(utcTimeString: string) {
        try {
            if (utcTimeString === null) {
                return null
            }
            const utcDateString = utcTimeString;
            const dateObj = new Date(utcDateString); // 将UTC格式字符串转换为Date对象

            if (this.plugin.settings.debugMode) { console.log("Inside taskParser.ts the dateObj now is: " + JSON.stringify(dateObj)) }

            const year = dateObj.getFullYear();
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const date = dateObj.getDate().toString().padStart(2, '0');
            const localDateString = `${year}-${month}-${date}`;

            return localDateString;
            return (localDateString);
        } catch (error) {
            console.error(`Error extracting date from string '${utcTimeString}': ${error}`);
            return null;
        }
    }


    //This is a dup from ISOStringToLocalDateString, but parse the time
    ISOStringToLocalClockTimeString(utcTimeString: string) {
        try {
            if (utcTimeString === null) {
                return null
            }
            const utcDateString = utcTimeString;
            const dateObj = new Date(utcDateString); // 将UTC格式字符串转换为Date对象

            const timeHour = dateObj.getHours();
            const timeMinute = dateObj.getMinutes();

            let timeHourString;
            let timeMinuteString;

            if (timeMinute < 10) {
                timeMinuteString = "0" + JSON.stringify(dateObj.getMinutes())
            } else {
                timeMinuteString = JSON.stringify(dateObj.getMinutes())
            }

            //   Fixes the issue of hour and minutes having a single digit
            if (timeHour < 10) {
                timeHourString = "0" + JSON.stringify(dateObj.getHours())
            } else {
                timeHourString = JSON.stringify(dateObj.getHours())
            }


            const localTimeString = `${timeHourString}:${timeMinuteString}`;

            return localTimeString;
            return (localTimeString);
        } catch (error) {
            console.error(`Error extracting date from string '${utcTimeString}': ${error}`);
            return null;
        }
    }




    //extra date from obsidian event
    // 使用示例
    //const str = "2023-03-27T15:59:59.000000Z";
    //const dateStr = ISOStringToLocalDatetimeString(str);
    //console.log(dateStr); // 输出 Mon Mar 27 2023 23:59:59 GMT+0800 (China Standard Time)
    ISOStringToLocalDatetimeString(utcTimeString: string) {
        try {
            if (utcTimeString === null) {
                return null
            }
            const utcDateString = utcTimeString;
            const dateObj = new Date(utcDateString); // 将UTC格式字符串转换为Date对象
            const result = dateObj.toString();
            return (result);
        } catch (error) {
            console.error(`Error extracting date from string '${utcTimeString}': ${error}`);
            return null;
        }
    }



    //convert date from obsidian event
    // 使用示例
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDatetimeString(str);
    //console.log(dateStr); // 输出 2023-03-27T00:00:00.000Z
    localDateStringToUTCDatetimeString(localDatetimeString: string) {
        try {
            if (localDatetimeString === null) {
                return null
            }
            //   localDatetimeString = localDatetimeString;
            const localDateObj = new Date(localDatetimeString);
            const ISOString = localDateObj.toISOString()
            return (ISOString);
        } catch (error) {
            console.error(`Error extracting date from string '${localDatetimeString}': ${error}`);
            return null;
        }
    }

    //convert date from obsidian event
    // 使用示例
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDateString(str);
    //console.log(dateStr); // 输出 2023-03-27
    localDateStringToUTCDateString(localDateString: string) {
        try {
            if (localDateString === null) {
                return null
            }
            //   localDateString = localDateString;
            const localDateObj = new Date(localDateString);
            const ISOString = localDateObj.toISOString()
            //   let utcDateString = ISOString.slice(0,10)
            return (ISOString);
        } catch (error) {
            console.error(`Error extracting date from string '${localDateString}': ${error}`);
            return null;
        }
    }

    isMarkdownTask(str: string): boolean {
        const taskRegex = /^\s*-\s+\[([x ])\]/;
        return taskRegex.test(str);
    }

    addTodoistTag(str: string): string {
        const tag_to_be_added = this.keywords_function("TODOIST_TAG")
        return (str + ` ${tag_to_be_added}`);
    }

    getObsidianUrlFromFilepath(filepath: string) {
        const url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`)
        const obsidianUrl = `[${filepath}](${url})`;
        return (obsidianUrl)
    }


    addTodoistLink(linetext: string, todoistLink: string): string {
        // const regex = new RegExp(`${keywords.TODOIST_TAG}`, "g");

        // Looks for #todoist to identify where to put the link.
        // TODO let the user choose which tag to use
        const regex = new RegExp(this.keywords_function("TODOIST_TAG"), "g");
        // console.log("regex is " + regex)
        // TODO check if already has a link, to prevent from adding multiple links
        return linetext.replace(regex, ' ' + '$&' + ' ' + todoistLink);
    }


    //检查是否包含todoist link
    hasTodoistLink(lineText: string) {
        // TODOIST_LINK:/\[link\]\(.*?\)/,
        const regex_has_todoist_link = new RegExp(/%%\[tid::\s*\[\d+\]\(https:\/\/todoist\.com\/app\/task\/\d+\)\]%%/);

        return (regex_has_todoist_link.test(lineText))
    }
}
