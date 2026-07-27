import { loadBackofficeEnv } from '@flower/config';

export type AppEnvironmentMode = 'development' | 'staging' | 'production';

export type AppEnvironment = {
  mode: AppEnvironmentMode;
  showBanner: boolean;
  badge: string;
  title: string;
  hint: string;
  apiBaseUrl: string;
};

function resolveMode(
  appEnv: 'development' | 'staging' | 'production' | undefined,
  nodeEnv: 'development' | 'test' | 'production',
): AppEnvironmentMode {
  if (appEnv) return appEnv;
  if (nodeEnv === 'development' || nodeEnv === 'test') return 'development';
  return 'production';
}

export function getAppEnvironment(
  env: Record<string, string | undefined> = process.env,
): AppEnvironment {
  const parsed = loadBackofficeEnv(env);
  const mode = resolveMode(parsed.NEXT_PUBLIC_APP_ENV, parsed.NODE_ENV);
  const apiBaseUrl = parsed.NEXT_PUBLIC_API_BASE_URL;

  if (mode === 'staging') {
    return {
      mode,
      showBanner: true,
      badge: 'STG',
      title: 'Тестовый контур',
      hint: 'Данные могут быть неактуальны. Не используйте для реальной работы магазина.',
      apiBaseUrl,
    };
  }

  if (mode === 'development') {
    return {
      mode,
      showBanner: true,
      badge: 'DEV',
      title: 'Режим разработки',
      hint: 'Сборка для разработчиков. Изменения в коде могут перезагружать интерфейс.',
      apiBaseUrl,
    };
  }

  return {
    mode,
    showBanner: false,
    badge: '',
    title: '',
    hint: '',
    apiBaseUrl,
  };
}
