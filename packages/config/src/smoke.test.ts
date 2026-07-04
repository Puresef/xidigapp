import { describe, expect, it } from 'vitest';

import { APP_NAME, WORKSPACE_SCOPE } from './index';

describe('@xidig/config', () => {
  it('exposes the workspace scope', () => {
    expect(WORKSPACE_SCOPE).toBe('@xidig');
  });

  it('exposes the app name', () => {
    expect(APP_NAME).toBe('Xidig');
  });
});
