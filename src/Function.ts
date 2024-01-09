import dayjs, { Dayjs } from 'dayjs';

const formatDayjs = (dayjs: Dayjs) => dayjs.format('YYYY-MM-DD');

export const Function = {
  sum: (column: string) => {
    return `SUM(${column})`;
  },
  year: (column: string) => {
    return `YEAR(${column})`;
  },
  month: (column: string) => {
    return `MONTH(${column})`;
  },
  min: (column: string) => {
    return `MIN(${column})`;
  },
  max: (column: string) => {
    return `MAX(${column})`;
  },
  dateDiff: (
    interval: 'year' | 'month' | 'day',
    date1: string,
    date2: string
  ) => {
    if (interval === 'month') {
      return `TIMESTAMPDIFF(MONTH,${date1}, ${date2})`;
    } else if (interval === 'day') {
      return `DATEDIFF(${date1}, ${date2})`;
    } else {
      return `YEAR(${date1}) - YEAR(${date2})`;
    }
  },
  formatDate: (date: Dayjs) => {
    return `'${formatDayjs(date)}'`;
  },
  string: (value: string) => {
    return `'${value}'`;
  },
  concat: (...values: string[]) => {
    return `CONCAT(${values.join(',')})`;
  },
  dateRangeSumField: ({
    dateColumn,
    valueColumn,
    start,
    end,
  }: {
    dateColumn: string;
    valueColumn: string;
    start: Dayjs | string;
    end: Dayjs | string;
  }) =>
    `SUM(IF(${dateColumn} BETWEEN '${formatDayjs(
      dayjs(start)
    )}' AND '${formatDayjs(dayjs(end))}',${valueColumn},0))`,

  priceCurrentAndPreviousDiffField: ({
    thisYearColumn,
    lastYearColumn,
  }: {
    thisYearColumn: string;
    lastYearColumn: string;
  }) =>
    'CASE ' +
    `WHEN ${thisYearColumn} = 0 AND ${lastYearColumn} = 0 THEN 0 ` +
    `WHEN ${lastYearColumn} = 0 THEN null ` +
    `WHEN ${thisYearColumn} = 0 THEN -1 ` +
    `ELSE (${thisYearColumn} - ${lastYearColumn}) / ${lastYearColumn} ` +
    'END',
};

export { Function as Fn };