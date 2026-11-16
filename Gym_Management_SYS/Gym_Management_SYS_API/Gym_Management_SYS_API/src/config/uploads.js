import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PROFILE_PICTURES_DIRECTORY = path.join(projectRoot, 'uploads', 'profile-pictures');
export const PROFILE_PICTURES_URL_PATH = '/uploads/profile-pictures';
