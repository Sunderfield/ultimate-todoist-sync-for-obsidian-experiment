import { App, requestUrl } from 'obsidian';
import AnotherSimpleTodoistSync from "../main";
import {v4 as uuidv4 } from "uuid";

type Event = {
  id: string;
  object_type: string;
  object_id: string;
  event_type: string;
  event_date: string;
  parent_project_id: string;
  parent_item_id: string | null;
  initiator_id: string | null;
  extra_data: Record<string, any>;
};

type FilterOptions = {
  event_type?: string;
  object_type?: string;
};

export class TodoistSyncAPI {
  app: App;
  plugin: AnotherSimpleTodoistSync;

  constructor(app: App, plugin: AnotherSimpleTodoistSync) {
    //super(app,settings);
    this.app = app;
    this.plugin = plugin;
  }

  //backup Todoist
  async getAllResources() {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/sync';
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        sync_token: "*",
        resource_types: '["all"]'
      })
    };

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers: {
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: `${options.body}`
      })

      if (response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }

      const data = response.json;

      return data
    } catch (error) {
      console.error(error)
      throw new Error(`Could not create a backup from Todoist. Please try again later.`)
    }
  }

  //backup Todoist
  async getUserResource() {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/sync';
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        sync_token: "*",
        resource_types: '["user_plan_limits"]'
      })
    };

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers: {
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: `${options.body}`
      })

      if (response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }
      const data = response.json
      console.log(`getUserResource is ${JSON.stringify(data)}`)
      return data
    } catch (error) {
      console.error('Failed to fetch user resources from Todoist API:', error)
      throw new Error('Could not retrieve user resources. Please try again later.')
    }
  }



  //update user timezone
  async updateUserTimezone() {
    const unixTimestampString: string = Math.floor(Date.now() / 1000).toString();
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/sync';
    const commands = [
      {
        'type': "user_update",
        'uuid': unixTimestampString,
        'args': { 'timezone': 'Asia/Shanghai' },
      },
    ];
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ commands: JSON.stringify(commands) })
    };

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers:{
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: `${options.body}`
      })

      if(response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }

      const data = response.json
      return data
    } catch(error){
      console.error(`Failed to update user timezone on Todoist API:`, error)
      throw new Error(`Could not update the user timezone, please try again later.`)
    }
  }

  //get activity logs
  //result  {count:number,events:[]}
  async getAllActivityEvents() {
    const accessToken = this.plugin.settings.todoistAPIToken;
    
    try {
      const response = await requestUrl({
        url: 'https://api.todoist.com/sync/v9/activity/get',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
          // 'Content-Type': 'application/json'
        }
        // body: JSON.stringify({})
      });

      // Check if the HTTP status code indicates an error.
      if (response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`);
      }

      // Extract the JSON data from the response.
      const data = response.json;
      return data;
    } catch (error) {
      console.error('Failed to fetch data from Todoist API:', error);
      throw new Error('Could not retrieve activity data. Please try again later.');
    }
  }

  async getNonObsidianAllActivityEvents() {
    try {
      const allActivity = await this.getAllActivityEvents()
      //console.log(allActivity)
      const allActivityEvents = allActivity.events
      //client中不包含obsidian 的activity
      const filteredArray = allActivityEvents.filter((obj: Event) => !obj.extra_data.client?.includes("obsidian"));
      return (filteredArray)

    } catch (err) {
      console.error('An error occurred:', err);
    }

  }





  filterActivityEvents(events: Event[], options: FilterOptions): Event[] {
    return events.filter(event =>
      (options.event_type ? event.event_type === options.event_type : true) &&
      (options.object_type ? event.object_type === options.object_type : true)

    );
  }

  //get completed items activity
  //result  {count:number,events:[]}
  async getCompletedItemsActivity() {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/activity/get';
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'object_type': 'item',
        'event_type': 'completed'
      })
    };

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers:{
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: `${options.body}`
      })

      if(response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }

      const data = response.json
      return data
    }catch(error){
      console.error(`Failed to get all completed activities from Todoist API:`, error)
      throw new Error(`Could not fetch all completed activities, please try again later.`)
    }
  }



  //get uncompleted items activity
  //result  {count:number,events:[]}
  async getUncompletedItemsActivity() {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/activity/get';
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'object_type': 'item',
        'event_type': 'uncompleted'
      })
    };

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers:{
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: `${options.body}`
      })

      if(response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }

      const data = response.json
      return data
    } catch(error){
      console.error(`Failed to fetch uncompleted activities from Todoist API:`, error)
      throw new Error(`Failed to fetch uncompleted activities, please try again later.`)
    }
  }


  //get non-obsidian completed event
  async getNonObsidianCompletedItemsActivity() {
    // const accessToken = this.plugin.settings.todoistAPIToken
    const completedItemsActivity = await this.getCompletedItemsActivity()
    const completedItemsActivityEvents = completedItemsActivity.events
    //client中不包含obsidian 的activity
    const filteredArray = completedItemsActivityEvents.filter((obj: { extra_data: { client: string } }) => !obj.extra_data.client.includes("obsidian"));
    return (filteredArray)
  }


  //get non-obsidian uncompleted event
  async getNonObsidianUncompletedItemsActivity() {
    const uncompletedItemsActivity = await this.getUncompletedItemsActivity()
    const uncompletedItemsActivityEvents = uncompletedItemsActivity.events
    //client中不包含obsidian 的activity
    const filteredArray = uncompletedItemsActivityEvents.filter((obj: { extra_data: { client: string } }) => !obj.extra_data.client.includes("obsidian"));
    return (filteredArray)
  }


  //get updated items activity
  //result  {count:number,events:[]}
  async getUpdatedItemsActivity() {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/activity/get';
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'object_type': 'item',
        'event_type': 'updated'
      })
    };

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers:{
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: `${options.body}`
      })

      if(response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }

      const data = response.json
      console.log(`getUpdatedItemsActivity is : ${JSON.stringify(data)}`)
      return data
    } catch(error){
      console.error(`Failed to fetch updated itens from Todoist API:`, error)
      throw new Error(`Could not fetch updated itens, please try again later.`)
    }
  }


  //get non-obsidian updated event
  async getNonObsidianUpdatedItemsActivity() {
    const updatedItemsActivity = await this.getUpdatedItemsActivity()
    const updatedItemsActivityEvents = updatedItemsActivity.events
    //client中不包含obsidian 的activity
    const filteredArray = updatedItemsActivityEvents.filter((obj: { extra_data: { client?: string } }) => {
      const client = obj.extra_data && obj.extra_data.client;
      return !client || !client.includes("obsidian");
    });
    return (filteredArray)
  }


  //get completed items activity
  //result  {count:number,events:[]}
  async getProjectsActivity() {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/activity/get';
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'object_type': 'project'
      })
    };

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers:{
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: `${options.body}`
      })

      if(response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }

      const data = response.json
      return data
    } catch(error){
      console.error(`Failed to get project activities from Todoist API:`, error)
      throw new Error(`Could not fetch project activities, please try again later.`)
    }
  }

  async generateUniqueId(): Promise<string> {
    const uuidString = JSON.stringify(uuidv4())
    return uuidString
  }

  async moveTaskToAnotherSection(taskId: string, newSectionId: string) {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/sync/v9/sync'
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    // TODO generate a random UUID
    const random_uuid =  await this.generateUniqueId()

    const commands = JSON.stringify([
      {
        type: "item_move",
        uuid: random_uuid,
        args: {
          id: taskId,
          section_id: newSectionId,
        },
      },
    ]);

    try {
      const response = await requestUrl({
        url: `${url}`,
        method: `${options.method}`,
        headers:{
          Authorization: `${options.headers.Authorization}`,
          'Content-Type': `${options.headers['Content-Type']}`
        },
        body: new URLSearchParams({ commands }).toString(),
      })

      if(response.status >= 400) {
        throw new Error(`API returned error status: ${response.status}`)
      }

      const data = response.json
      return data
    } catch(error){
        console.error(`Failed to update a task section:`, error)
      throw new Error(`Could not update a task section, please try again later.`)
    }
    }
    
  }



















