export const addHours = (hours: number): Date => new Date(Date.now() + hours * 60 * 60 * 1000);

export const addDays = (days: number): Date => addHours(days * 24);
