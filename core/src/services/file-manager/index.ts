import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { MultipartFile } from '@fastify/multipart';
import { config } from '../../lib/config';
import { logger } from '../../lib/logger';
import { emitEvent, Events } from '../../lib/events';

export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  created: string;
}

export interface DirectoryListing {
  path: string;
  items: FileInfo[];
}

export class FileManager {
  private resolvePath(relativePath: string): string {
    // Normalize and resolve the path
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(config.documentsDir, normalized);
    
    // Security: ensure path is within documents directory
    if (!fullPath.startsWith(config.documentsDir)) {
      throw new Error('Invalid path: access denied');
    }
    
    return fullPath;
  }

  async getPath(relativePath: string): Promise<DirectoryListing | { file: FileInfo; content?: string }> {
    const fullPath = this.resolvePath(relativePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error('Path not found');
    }
    
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      return this.listDirectory(relativePath);
    } else {
      const info = this.getFileInfo(fullPath, relativePath);
      
      // For text files, include content
      const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.yml', '.yaml', '.xml', '.csv'];
      const ext = path.extname(fullPath).toLowerCase();
      
      if (textExtensions.includes(ext) && stats.size < 1024 * 1024) { // < 1MB
        const content = fs.readFileSync(fullPath, 'utf-8');
        return { file: info, content };
      }
      
      return { file: info };
    }
  }

  async listDirectory(relativePath: string): Promise<DirectoryListing> {
    const fullPath = this.resolvePath(relativePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error('Directory not found');
    }
    
    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }
    
    const entries = fs.readdirSync(fullPath);
    const items: FileInfo[] = [];
    
    for (const entry of entries) {
      // Skip hidden files
      if (entry.startsWith('.')) continue;
      
      const entryPath = path.join(fullPath, entry);
      const entryRelativePath = path.join(relativePath, entry);
      
      try {
        const info = this.getFileInfo(entryPath, entryRelativePath);
        items.push(info);
      } catch {
        // Skip files we can't read
      }
    }
    
    // Sort: directories first, then alphabetically
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    return {
      path: relativePath || '/',
      items,
    };
  }

  private getFileInfo(fullPath: string, relativePath: string): FileInfo {
    const stats = fs.statSync(fullPath);
    
    return {
      name: path.basename(fullPath),
      path: relativePath,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
    };
  }

  async createDirectory(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    
    if (fs.existsSync(fullPath)) {
      throw new Error('Path already exists');
    }
    
    fs.mkdirSync(fullPath, { recursive: true });
    logger.info(`Created directory: ${relativePath}`);
    emitEvent(Events.FILE_CREATED, { path: relativePath, type: 'directory' });
  }

  async uploadFile(relativePath: string, file: MultipartFile): Promise<void> {
    // If relativePath is a directory, use the original filename
    let targetPath = this.resolvePath(relativePath);
    
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, file.filename);
    }
    
    // Ensure parent directory exists
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    await pipeline(file.file, fs.createWriteStream(targetPath));
    
    const finalRelativePath = path.relative(config.documentsDir, targetPath);
    logger.info(`Uploaded file: ${finalRelativePath}`);
    emitEvent(Events.FILE_CREATED, { path: finalRelativePath, type: 'file' });
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    
    // Ensure parent directory exists
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
    logger.info(`Wrote file: ${relativePath}`);
    emitEvent(Events.FILE_MODIFIED, { path: relativePath });
  }

  async deletePath(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error('Path not found');
    }
    
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    
    logger.info(`Deleted: ${relativePath}`);
    emitEvent(Events.FILE_DELETED, { path: relativePath, type: stats.isDirectory() ? 'directory' : 'file' });
  }

  async movePath(oldPath: string, newPath: string): Promise<void> {
    const fullOldPath = this.resolvePath(oldPath);
    const fullNewPath = this.resolvePath(newPath);
    
    if (!fs.existsSync(fullOldPath)) {
      throw new Error('Source path not found');
    }
    
    if (fs.existsSync(fullNewPath)) {
      throw new Error('Destination path already exists');
    }
    
    // Ensure parent directory exists
    const parentDir = path.dirname(fullNewPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    fs.renameSync(fullOldPath, fullNewPath);
    logger.info(`Moved: ${oldPath} -> ${newPath}`);
    emitEvent(Events.FILE_MODIFIED, { oldPath, newPath });
  }
}
