/** Provides access to a single specification file on the local disk. */
export class SpecificationFile {

  /** Returns whether the browser can open a local file. */
  public static isSupported(): boolean {
    return typeof (window as any).showOpenFilePicker === 'function';
  }

  /** Prompts for a file to open and returns a handle to it. */
  public static async open(): Promise<SpecificationFile> {
    const handles = await (window as any).showOpenFilePicker({
      id: 'caro-specifications',
      types: [SpecificationFile.TYPE],
      multiple: false
    });
    return new SpecificationFile(handles[0]);
  }

  /** Prompts for somewhere to write a specification that has no file yet. */
  public static async create(name: string): Promise<SpecificationFile> {
    const handle = await (window as any).showSaveFilePicker({
      id: 'caro-specifications',
      suggestedName: name,
      types: [SpecificationFile.TYPE]
    });
    return new SpecificationFile(handle);
  }

  /** Returns the name of the file. */
  public get name(): string {
    return this.handle.name;
  }

  /** Returns the contents of the file. */
  public async read(): Promise<string> {
    const file = await this.handle.getFile();
    return await file.text();
  }

  /** Writes text to the file. */
  public async write(text: string): Promise<void> {
    const stream = await this.handle.createWritable();
    await stream.write(text);
    await stream.close();
  }

  private static readonly TYPE = {
    description: 'Layout specification',
    accept: {'application/json': ['.json']}
  };

  private handle: any;

  private constructor(handle: any) {
    this.handle = handle;
  }
}
