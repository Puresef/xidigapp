'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* NextError requires a statusCode; 0 is the documented value for
            unhandled client-side errors that don't map to an HTTP status. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
