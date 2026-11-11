import type { UOperationStatus } from '../types';
import type { IPreset } from './types';

/** One entry per operation the panel offers, in the order of the buttons. */
export const PRESETS: IPreset[] = [
  { name: 'health', label: 'health', hint: 'health { status } — готовность бэкенда.' },
  {
    name: 'profile',
    label: 'profile',
    hint: 'Профиль со всеми вложенными коллекциями: links, skills, experience, projects.',
  },
  {
    name: 'profiles',
    label: 'profiles',
    hint: 'Страница профилей: limit в диапазоне 1..100 и offset.',
  },
  {
    name: 'custom',
    label: 'свой запрос',
    hint: 'Любой документ GraphQL и переменные JSON; документ из TZ уже подставлен.',
  },
];

/** Label of every status, shown next to the heading of the result panel. */
export const STATUS_LABELS: Record<UOperationStatus, string> = {
  idle: 'ожидание',
  loading: 'выполняется',
  success: 'успех',
  error: 'ошибка',
};
