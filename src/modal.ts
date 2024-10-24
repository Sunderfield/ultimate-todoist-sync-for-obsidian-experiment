import { App, Modal, Setting } from "obsidian";
import AnotherSimpleTodoistSync from "../main"


interface ModalInterface {
  id: string;
  name: string;
}

export class SetDefalutProjectInTheFilepathModal extends Modal {
  defaultProjectId: string
  defaultProjectName: string
  filepath: string
  plugin: AnotherSimpleTodoistSync


  constructor(app: App, plugin: AnotherSimpleTodoistSync, filepath: string) {
    super(app);
    this.filepath = filepath
    this.plugin = plugin
    this.open()
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h5', { text: 'Set default project for Todoist tasks in the current file' });

    this.defaultProjectId = await this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(this.filepath)
    this.defaultProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(this.defaultProjectId)
    const myProjectsOptions: ModalInterface | undefined = this.plugin.settings.todoistTasksData?.projects?.reduce((obj:any, item:any) => {
      obj[(item.id).toString()] = item.name;
      return obj;
    }, {}
    );



    new Setting(contentEl)
      .setName('Default project')
      //.setDesc('Set default project for Todoist tasks in the current file')
      .addDropdown(component =>
        component
          .addOption(this.defaultProjectId, this.defaultProjectName)
          .addOptions(myProjectsOptions)
          .onChange((value) => {
            this.plugin.cacheOperation?.setDefaultProjectIdForFilepath(this.filepath, value)
            this.plugin.setStatusBarText()
            this.close();

          })

      )




  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}