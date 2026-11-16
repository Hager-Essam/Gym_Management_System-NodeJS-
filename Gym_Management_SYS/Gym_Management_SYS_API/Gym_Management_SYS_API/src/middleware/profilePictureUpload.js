import multer from 'multer';
import { AppError } from './errorHandler.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const isValidImage = (file) => {
  const { buffer, mimetype } = file;

  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimetype === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimetype === 'image/webp') {
    return buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  return false;
};

const parseProfilePicture = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new AppError('Profile picture must be a JPEG, PNG, or WebP image', 400));
      return;
    }

    callback(null, true);
  },
}).single('profilePicture');

export const uploadProfilePicture = (req, res, next) => {
  parseProfilePicture(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        return next(new AppError('Profile picture must be no larger than 5 MB', 400));
      }

      return next(error);
    }

    if (req.file && !isValidImage(req.file)) {
      return next(new AppError('Uploaded file is not a valid JPEG, PNG, or WebP image', 400));
    }

    return next();
  });
};
