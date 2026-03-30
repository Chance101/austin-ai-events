import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('config', () => {
  // Save original env vars and restore after each test
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  describe('validateConfig', () => {
    it('throws when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      // Re-import to get fresh config reflecting cleared env
      // We use a cache-busting query param so Node re-evaluates the module
      const { validateConfig, config } = await import(`./config.js?bust=${Date.now()}-1`);

      // Manually clear the config values since the module may have cached them
      config.anthropicApiKey = undefined;
      config.supabaseUrl = undefined;
      config.supabaseServiceKey = undefined;

      assert.throws(
        () => validateConfig(),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('anthropicApiKey'));
          return true;
        }
      );
    });

    it('throws when SUPABASE_URL is missing', async () => {
      const { validateConfig, config } = await import(`./config.js?bust=${Date.now()}-2`);

      config.anthropicApiKey = 'sk-test-key';
      config.supabaseUrl = undefined;
      config.supabaseServiceKey = 'test-service-key';

      assert.throws(
        () => validateConfig(),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('supabaseUrl'));
          return true;
        }
      );
    });

    it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      const { validateConfig, config } = await import(`./config.js?bust=${Date.now()}-3`);

      config.anthropicApiKey = 'sk-test-key';
      config.supabaseUrl = 'https://test.supabase.co';
      config.supabaseServiceKey = undefined;

      assert.throws(
        () => validateConfig(),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('supabaseServiceKey'));
          return true;
        }
      );
    });

    it('does not throw when all required vars are present', async () => {
      const { validateConfig, config } = await import(`./config.js?bust=${Date.now()}-4`);

      config.anthropicApiKey = 'sk-test-key';
      config.supabaseUrl = 'https://test.supabase.co';
      config.supabaseServiceKey = 'test-service-key';
      config.serpApiKey = 'test-serp-key';

      assert.doesNotThrow(() => validateConfig());
    });

    it('warns but does not throw when SERPAPI_API_KEY is missing', async () => {
      const { validateConfig, config } = await import(`./config.js?bust=${Date.now()}-5`);

      config.anthropicApiKey = 'sk-test-key';
      config.supabaseUrl = 'https://test.supabase.co';
      config.supabaseServiceKey = 'test-service-key';
      config.serpApiKey = undefined;

      // Should not throw
      assert.doesNotThrow(() => validateConfig());
    });

    it('throws listing all missing required vars at once', async () => {
      const { validateConfig, config } = await import(`./config.js?bust=${Date.now()}-6`);

      config.anthropicApiKey = undefined;
      config.supabaseUrl = undefined;
      config.supabaseServiceKey = undefined;

      assert.throws(
        () => validateConfig(),
        (err) => {
          assert.ok(err.message.includes('anthropicApiKey'));
          assert.ok(err.message.includes('supabaseUrl'));
          assert.ok(err.message.includes('supabaseServiceKey'));
          return true;
        }
      );
    });
  });

  describe('config structure', () => {
    it('has models.fast defined', async () => {
      const { config } = await import(`./config.js?bust=${Date.now()}-7`);
      assert.ok(config.models, 'config.models should exist');
      assert.ok(typeof config.models.fast === 'string', 'models.fast should be a string');
      assert.ok(config.models.fast.length > 0, 'models.fast should not be empty');
    });

    it('has models.standard defined', async () => {
      const { config } = await import(`./config.js?bust=${Date.now()}-8`);
      assert.ok(typeof config.models.standard === 'string', 'models.standard should be a string');
      assert.ok(config.models.standard.length > 0, 'models.standard should not be empty');
    });

    it('has models.strategic defined', async () => {
      const { config } = await import(`./config.js?bust=${Date.now()}-9`);
      assert.ok(typeof config.models.strategic === 'string', 'models.strategic should be a string');
      assert.ok(config.models.strategic.length > 0, 'models.strategic should not be empty');
    });

    it('models.fast references a haiku model', async () => {
      const { config } = await import(`./config.js?bust=${Date.now()}-10`);
      assert.ok(config.models.fast.includes('haiku'), 'fast model should be haiku');
    });

    it('models.strategic references an opus model', async () => {
      const { config } = await import(`./config.js?bust=${Date.now()}-11`);
      assert.ok(config.models.strategic.includes('opus'), 'strategic model should be opus');
    });

    it('has sources array with entries', async () => {
      const { config } = await import(`./config.js?bust=${Date.now()}-12`);
      assert.ok(Array.isArray(config.sources), 'sources should be an array');
      assert.ok(config.sources.length > 0, 'sources should not be empty');
    });

    it('each source has required fields (id, name, url, type)', async () => {
      const { config } = await import(`./config.js?bust=${Date.now()}-13`);
      for (const source of config.sources) {
        assert.ok(source.id, `Source missing id: ${JSON.stringify(source)}`);
        assert.ok(source.name, `Source missing name: ${JSON.stringify(source)}`);
        assert.ok(source.url, `Source missing url: ${JSON.stringify(source)}`);
        assert.ok(source.type, `Source missing type: ${JSON.stringify(source)}`);
      }
    });
  });
});
