import {promises as fs} from 'fs';
import fsOriginal from 'fs';
import {parse} from 'node-html-parser';

import { resolve, join, dirname } from 'path';

const distDirectory = './dist';
const assetsDir = './assets';
const pagesDir = './pages';
const componentsDir = './components';
const componentsDeps = new Map()

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

async function walkAndCopy(sourceDir, targetDir, callback) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (let entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      // Рекурсивный вызов функции для поддиректории
      await walkAndCopy(sourcePath, targetPath, callback);
    } else {
      // Копирование файла
      await callback(sourcePath, targetPath);
    }
  }
}


async function replaceComponentContent(component, source, target) {
  const componentName = component.getAttribute('name');
  if (componentName) {
    if (!componentsDeps.has(componentName)) {
      componentsDeps.set(componentName, [[source, target]]);
    } else {
      componentsDeps.set(componentName, [...componentsDeps.get(componentName), [source, target]]);
    }
    const componentContent = await fs.readFile(`${componentsDir}/${componentName}.html`, 'utf8');
    const newComponent = parse(componentContent);
    await processComponents(newComponent, source, target); // Рекурсивная обработка вложенных компонентов
    component.replaceWith(newComponent);
  }
}

async function processComponents(root, source, target) {
  const components = root.querySelectorAll('component');
  for (const component of components) {
    await replaceComponentContent(component, source, target);
  }
}

async function replaceComponents(source, target) {
  try {
    const targetFolder = dirname(target);
    try {
      await fs.mkdir(targetFolder, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const htmlContent = await fs.readFile(source, 'utf8');
    const root = parse(htmlContent);

    await processComponents(root, source, target); // Обработка компонентов

    await fs.writeFile(target, root.toString()); // Сохранение измененного HTML
  } catch (error) {
    console.error('Ошибка при обработке файла:', error);
  }
}
async function build() {

  // Empty dist directory first
  await deleteFolderRecursive(distDirectory);
  await walkAndCopy(assetsDir, distDirectory + '/assets', copyFile);
  await walkAndCopy(pagesDir, distDirectory, replaceComponents);
  
  // Watch file changes in assets
  fsOriginal.watch(assetsDir, { recursive: true }, async (eventType, filename) => {
    const sourcePath = join(assetsDir, filename);
    const targetPath = join(distDirectory + '/assets', filename);
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
      await replaceComponents(sourcePath, targetPath);
    } catch (error) {
      console.error('Ошибка при копировании файла:', error);
    }
  });

  fsOriginal.watch(componentsDir, { recursive: true }, async (eventType, filename) => {
    const componentName = filename.replace('.html', '');
    if (componentsDeps.has(componentName)) {
      const deps = componentsDeps.get(componentName);
      deps.forEach(([source, target]) => {
        replaceComponents(source, target);
      })
    } else {
      console.log(filename)
    }
  });
}

export default build;