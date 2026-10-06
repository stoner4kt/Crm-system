import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json(data);
}

export function sendError(res: Response, status: number, message: string, details?: unknown): Response {
  return res.status(status).json({
    error: { message, ...(details ? { details } : {}) },
  });
}