import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { fromZodError } from 'zod-validation-error';

/**
 * Query validation middleware. On Express 5, `req.query` is a read-only
 * getter — we expose the parsed value via `res.locals.query` and (best effort)
 * set `req.validatedQuery` for route handlers that prefer a typed field.
 */
export interface ValidatedRequest<Q> extends Request {
  validatedQuery?: Q;
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: ValidatedRequest<T>, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const readable = fromZodError(result.error);
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: readable.message,
        issues: result.error.issues,
      });
      return;
    }
    (req as ValidatedRequest<T>).validatedQuery = result.data;
    res.locals.query = result.data;
    next();
  };
}
