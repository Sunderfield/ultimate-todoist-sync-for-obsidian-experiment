## CHANGELOG

### 2024-10-01
#### 0.1.4
- Added a new feature flag that hide experimental or in-development features
- Cleanup on the regex function of the taskParser file


### 2024-09-30
#### 0.1.3
- Encapsulated some console.log on debugMode settings
- Fix an issue with the regex to look for links
- Removed the "link" keyword to have only the link within the TID property tag
- Fixed the issue where the text replace was not considering the tid_link

### 2024-09-24
#### 0.1.2
- Create a quick script to generate build numbers automatically

### 2024-09-23
#### 0.1.0
- bumped to v0.1, ready enough to be published
- when a reminder time is provided with the wrong hour or minute (H > 24 or M >59), it defaults to 11:59

#### 0.1.2
- Moved the link from the REGEX list to the function
- Now the `tid` also includes the link to the task. Next step is to remove the `link` text without break anything
- 

### 2024-09-22
#### 0.0.8
- Encapsulated most of console.log itens inside the debugMode settings


### 2024-09-21
#### 0.0.7
- Added opacity to the todoist_tag after the tag id
- Renamed the todoist_tag to tid (task_id) for short
- Moved all the REGEX tests on the taskParser to functions
- There was something odd on how it compare due dates, which was fixed. 
- Add the check to compare due time (reminder)
- 

#### 0.0.6
- Fixed the issue where time with a single digit breaks the replace logic

#### 0.0.5
- Added the "Comments Sync" option. Enabled by default, once disabled, won't add the notes/comments from Todoist below the task on Obsidian
- 

### 2024-09-20
#### 0.0.4
- Fixed the issue with with duedatetime, now it should be able to handle tasks with time, but is an overall simple solutions, needs more refinement
- Fixed the issue where tags with underscore were wrong parsed by REGEX
-


### 2024-08-13
#### 0.0.2
- Added the due date parser

### 2024-06-19
#### 0.0.1
- Initial code cleanup


