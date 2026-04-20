import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { fromZodError } from 'zod-validation-error';

/**
 * Body validation middleware. On success replaces `req.body` with the parsed
 * (and coerced / defaulted) value. On failure returns:
 *   400 { error: 'VALIDATION_ERROR', details: <human readable>, issues: [...] }
 *
 * Step 12c: request body schemas are now strict (no `.passthrough()`) so
 * unknown top-level keys produce VALIDATION_ERROR at the boundary.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const readable = fromZodError(result.error);
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: readable.message,
        issues: result.error.issues,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
