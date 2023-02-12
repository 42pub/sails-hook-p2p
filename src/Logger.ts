export default class Logger {
  private readonly name: string;
  private readonly showLogs: boolean;

  public constructor(name: string, showLogs: boolean) {
    this.name = name;
    this.showLogs = showLogs;
  }

  public info(...messages: any[]) {
    if (this.showLogs) {
      try {
        console.log(`${this.name} > ${messages.map(message => JSON.stringify(message)).join(' ')}`);
      } catch (e) {
        if (e instanceof TypeError) {
          console.warn(`${this.name} > try to show message but it contain object with circular reference. ` +
            'Please check a stack:', e);
        } else {
          console.error(`${this.name} > cannot show message, error: `, e);
        }
      }
    }
  }

}
