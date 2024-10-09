# Another Simple Todoist Sync for Obsidian (BETA)

Create, edit and delete tasks from Obsidian.md to your Todoist.

> [!WARNING]
> This is a fork from the [Ultimate Todoist Sync plugin for Obsidian](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian). I'm still working on fixing some things, but the main feature should be working. I'm considering this feature a beta. Feel free to contribute.
>
> *Some features works only Todoist -> Obsidian, others by-directional. Find more details on the feature table below.*

![Alt Text](/attachment/demo.gif)



<details>

<summary>Table of detailed features supported</summary>

| Feature                 | from Obsidian to Todoist | from Todoist to Obsidian | 
|-------------------------|-------------------------------|-------------------------------|
| Add task                | ✅                            | 🔜                           |             
| Delete task             | ✅                            | 🔜                           |             
| Modify task content     | ✅                            | ✅                           |             
| Modify task due date    | ✅                            | ✅                           |    
| Modify task due time    | ✅                            | 🔜                           |             
| Modify task description | 🔜                            | 🔜                           |             
| Modify task labels/tags | ✅                            | 🔜                           |             
| Mark task as completed  | ✅                            | ✅                           |             
| Mark task as uncompleted| ✅                            | ✅                           |             
| Modify project          | 🔜                            | 🔜                           |             
| Modify section          | 🔜                            | 🔜                           |             
| Modify priority [1]     | ✅                            | 🔜                           | 
| Add reminder            | ✅                            | ✅                           |
| Add duration            | ✅                            | 🔜                           |
| Move tasks between files| 🔜                            | 🔜                           |
| Added-at date           | 🔜                            | 🔜                           |
| Completed-at date       | 🔜                            | 🔜                           |
| Task notes [2]          | 🔜                            | ✅                           |

- [1] Task priority only support one-way synchronization
- [2] Task notes/comments only support one-way synchronization from Todoist to Obsidian.

</details>

## Installation

### From within Obsidian (*soon*)

> [!NOTE]
> I'm just doing some fixes on the original plugin, it is not yet published on the Obsidian plugins page.

<!-- From Obsidian v1.3.5+, you can activate this plugin within Obsidian by doing the following:

1. Open Obsidian's `Settings` window
2. Select the `Community plugins` tab on the left
3. Make sure `Restricted mode` is **off**
4. Click `Browse` next to `Community Plugins`
5. Search for and click on `Ultimate Todoist Sync`
6. Click `Install`
7. Once installed, close the `Community Plugins` window
8. Under `Installed Plugins`, activate the `Ultimate Todoist Sync` plugin

You can update the plugin following the same procedure, clicking `Update` instead of `Install` -->

### Manually

If you would rather install the plugin manually, you can do the following:

1. Download the latest release of the plugin from the [Releases](https://github.com/eudennis/ultimate-todoist-sync-for-obsidian-experiment/releases) page.
2. Extract the downloaded zip file and copy the entire folder to your Obsidian plugins directory.
3. Enable the plugin in the Obsidian settings.


## Configuration

1. Open Obsidian's `Settings` window
2. Select the `Community plugins` tab on the left
3. Under `Installed plugins`, click the gear icon next to the `Ultimate Todoist Sync` plugin
4. Enter your Todoist API token


## Settings
1. Automatic synchronization interval time
The time interval for automatic synchronization is set to 300 seconds by default, which means it runs every 5 minutes. You can modify it yourself.
2. Default project
New tasks will be added to the default project, and you can change the default project in the settings. 
3. Full vault sync
By enabling this option, the plugin will automatically add `#todoist` to all tasks, which will modify all files in the vault.


## Usage

### Task format

| Syntax | Description | Example |
| --- | --- | --- |
|#tdsync           |   Tasks marked with `#tdsync`[4] will be added to Todoist, while tasks without the `#tdsync` tag will not be processed. If you have enabled Full vault sync in the settings, `#tdsync` will be added automatically.| `- [ ] task #tdsync`|
| 📅YYYY-MM-DD      | The date format is 📅YYYY-MM-DD, indicating the due date of a task. | `- [ ] task content 📅2025-02-05 #todoist` [1] |
| #projectTag       | New tasks will be added to the default project (e.g: inbox), and you can change the default project in the settings or use a tag with the same name to specify a particular project. | `- [ ] taskA #todoist` will be added to inbox.<br>`- [ ] taskB #tag #testProject #todoist` will be added to testProject.|
| #tag              | Note that all tags without a project of the same name are treated as normal tags | `- [ ] task #tagA #tagB #tagC #todoist` |
|   `!!<number>`    | The priority of the task (a number between 1 and 4, 4 for very urgent and 1 for natural). [2] | `- [ ] task !!4 #todoist` |
|⏰HH:MM             |This sets the time of the task. If none is given, the default is 08:00|`- [ ] task ⏰23:59`[3]|
|⏳MMmin | This sets the duration of the task|`- [ ] task ⏳30min`[[5]] |

<details>
<summary>Usage footnotes</summary>

- [1] Supports the following characters/emojis: 📅, 📆, 🗓, 🗓️, @ [6]
- [2] Keep in mind that very urgent is the priority 1 on clients. So, the priority 1 in the client corresponds to the number 4 here (Because that's how the official API of Todoist is designed.).
- [3] Supports the following characters/emojis: ⏰, ⏲, $ [6]
- [4] On the original plugin, this tag was `#todoist`, but on this fork was changed to avoid conflicts.
- [5] Supports the following characters/emojis: ⏳, & [6]
- [6] Alternative characters are enabled via "Alternative Keywords" on plugin settings page

</details>

###  Set a default project for each file separately

The default project in the setting applies to all files. You can set a separate default project for each file using the comand `Set default project for todoist task in the current file` from the command menu. 

<img src="/attachment/command-set-default-project-for-file.png" width="500">
<img src="/attachment/default-project-for-file-modal.png" width="500">


## Disclaimer

This plugin is for learning purposes only. The author and contributors makes no representations or warranties of any kind, express or implied, about the accuracy, completeness, or usefulness of this plugin and shall not be liable for any losses or damages resulting from the use of this plugin.

The author shall not be responsible for any loss or damage, including but not limited to data loss, system crashes, computer damage, or any other form of loss arising from software problems or errors. Users assume all risks and are solely responsible for any consequences resulting from the use of this product.

By using this plugin, you agree to be bound by all the terms of this disclaimer. If you have any questions, please contact the author.


## Contributing

Contributions are welcome! If you'd like to contribute to the plugin, please feel free to submit a pull request.


## License

This plugin is released under the [GNU GPLv3 License](/LICENSE.md).

