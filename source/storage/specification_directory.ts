/** The name every layout specification file is stored under. */
export const LAYOUT_FILE = 'layout.json';

/** Provides access to a directory of specifications on the local disk. */
export class SpecificationDirectory {

  /** Returns whether the browser can open a local directory. */
  public static isSupported(): boolean {
    return typeof (window as any).showDirectoryPicker === 'function';
  }

  /** Prompts for a directory and returns a handle to it. */
  public static async open(): Promise<SpecificationDirectory> {
    const handle = await (window as any).showDirectoryPicker(
      {id: 'caro-specifications', mode: 'readwrite'});
    return new SpecificationDirectory(handle);
  }

  /** Returns the name of the directory. */
  public get name(): string {
    return this.handle.name;
  }

  /** Returns the path of every specification found, sorted by path. */
  public async list(): Promise<string[]> {
    const paths = [] as string[];
    await this.collect(this.handle, '', paths);
    paths.sort();
    return paths;
  }

  /** Returns the contents of the file stored at a given path. */
  public async read(path: string): Promise<string> {
    const handle = await this.resolve(path, false);
    const file = await handle.getFile();
    return await file.text();
  }

  /** Writes text to the file stored at a given path. */
  public async write(path: string, text: string): Promise<void> {
    const handle = await this.resolve(path, true);
    const stream = await handle.createWritable();
    await stream.write(text);
    await stream.close();
  }

  private handle: any;

  private constructor(handle: any) {
    this.handle = handle;
  }

  private async collect(directory: any, prefix: string,
      paths: string[]): Promise<void> {
    for await (const entry of directory.values()) {
      if(entry.kind === 'directory') {
        await this.collect(entry, `${prefix}${entry.name}/`, paths);
      } else if(entry.name === LAYOUT_FILE) {
        paths.push(`${prefix}${entry.name}`);
      }
    }
  }

  private async resolve(path: string, create: boolean): Promise<any> {
    const parts = path.split('/');
    let directory = this.handle;
    for(let i = 0; i < parts.length - 1; ++i) {
      directory = await directory.getDirectoryHandle(parts[i], {create});
    }
    return await directory.getFileHandle(parts[parts.length - 1], {create});
  }
}
