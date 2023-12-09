import {promises as fs} from 'fs';
import fsOriginal from 'fs';

import { resolve, join, dirname } from 'path';

const distDirectory = './dist';
const assetsDir = './assets';
const pagesDir = './pages';

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
async function deleteFolderRecursive(directoryPath) {
  if (await fileExists(directoryPath)) {
    const files = await fs.readdir(directoryPath);
    for (const file of files) {
      const currentPath = join(directoryPath, file);
      const stat = await fs.lstat(currentPath);

      if (stat.isDirectory()) {
        await deleteFolderRecursive(currentPath);
      } else {
        await fs.unlink(currentPath);
      }
    }
  }
}

async function copyFile(source, target) {
  // Создаем папку в целевом пути, если она еще не существует
  const targetFolder = dirname(target);
  try {
    await fs.mkdir(targetFolder, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error; // Игнорируем ошибку, если папка уже существует
  }

  // Копирование файла
  await fs.copyFile(source, target);
}

async function walkAndCopy(sourceDir, targetDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (let entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      // Рекурсивный вызов функции для поддиректории
      await walkAndCopy(sourcePath, targetPath);
    } else {
      // Копирование файла
      await copyFile(sourcePath, targetPath);
    }
  }
}
async function build() {

  // Empty dist directory first
  await deleteFolderRecursive(distDirectory);
  await walkAndCopy(assetsDir, distDirectory);
  await walkAndCopy(pagesDir, distDirectory);
  
  // Watch file changes in assets
  fsOriginal.watch(assetsDir, { recursive: true }, async (eventType, filename) => {
    const sourcePath = join(assetsDir, filename);
    const targetPath = join(distDirectory, filename);
    try {
      await copyFile(sourcePath, targetPath);
    } catch (error) {
      console.error('Ошибка при копировании файла:', error);
    }
  });

  // Watch file changes in pages
  fsOriginal.watch(pagesDir, { recursive: true }, async (eventType, filename) => {
    const sourcePath = join(pagesDir, filename);
    const targetPath = join(distDirectory, filename);
    try {
      await copyFile(sourcePath, targetPath);
    } catch (error) {
      console.error('Ошибка при копировании файла:', error);
    }
  });
}

export default build;