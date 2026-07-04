import { describe, expect, it } from 'vitest';

import { cn } from './cn';
import { Button } from './index';

describe('@xidig/ui', () => {
  it('cn joins only truthy class names', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('cn returns an empty string when nothing is truthy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('exports the Button component', () => {
    expect(typeof Button).toBe('function');
  });
});
