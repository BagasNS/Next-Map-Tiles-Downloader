import path from "path";
import * as fs from "fs";
import { JsonStreamStringify } from 'json-stream-stringify';
import JSONStream from 'jsonstream';


export function saveJSONFile(directory: string, filename: string, data: any) {
  return new Promise((resolve, reject) => {
    const dir = path.resolve('./', directory)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(directory, { recursive: true })
    }

    const writeStream = fs.createWriteStream(path.resolve(dir, filename), { flags: 'w' })
    const jsonStream = new JsonStreamStringify(Promise.resolve(Promise.resolve(data)))

    jsonStream.pipe(writeStream)

    jsonStream.on('end', resolve)
    jsonStream.once('error', (err) => {
      console.error(err);
      reject(err);
    });
  })
}

export function readJSONFile<T>(filePath: string): Promise<Array<T>> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject('File not found')
    }

    const parser = JSONStream.parse('*');
    fs.createReadStream(filePath).pipe(parser);

    const data: Array<T> = [];

    parser.on('data', (obj) => {
      data.push(obj)
    });

    parser.on('end', () => {
      resolve(data)
    })
  })
}
