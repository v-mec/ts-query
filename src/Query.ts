import { Condition } from "./Condition";
import { ISQLFlavor } from "./Flavor";
import { AWSTimestreamFlavor } from "./flavors/aws-timestream";
import { MySQLFlavor } from "./flavors/mysql";
import { DeleteMutation, UpdateMutation, InsertMutation } from "./Mutation";

const flavors = {
  mysql: new MySQLFlavor(),
  awsTimestream: new AWSTimestreamFlavor(),
};

type TableSource = string | SelectQuery;

export interface ISequelizable {
  toSQL(flavor: ISQLFlavor): string;
}
export interface ISerializable {
  serialize(): string;
}

export class Table implements ISequelizable, ISerializable {
  constructor(public source: TableSource, public alias?: string) {}
  public clone(): this {
    return new (this.constructor as any)(this.source, this.alias);
  }
  public getTableName(): string {
    if (typeof this.source === "string") {
      return this.source;
    }
    return this.source.table.getTableName();
  }

  toSQL(flavor: ISQLFlavor): string {
    const isSelect = isSelectQuery(this.source);
    const tableName = escapeTable(this.source, flavor);
    let alias = this.alias;
    if (isSelect && !alias) alias = "t";
    return `${tableName}${alias ? ` AS ${flavor.escapeColumn(alias)}` : ""}`;
  }
  toJSON(): any {
    return {
      type: "Table",
      source: this.source,
      alias: this.alias,
    };
  }
  static fromJSON(json: any): Table {
    if (
      typeof json.source === "object" &&
      json.source["type"] === "SelectQuery"
    ) {
      return new Table(SelectQuery.fromJSON(json.source), json.alias);
    }
    return new Table(json.source, json.alias);
  }
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
  static deserialize(json: string): Table {
    return Table.fromJSON(JSON.parse(json));
  }
}

function isSelectQuery(table: TableSource): table is SelectQuery {
  return table instanceof SelectQuery;
}
export const escapeTable = (table: TableSource, flavor: ISQLFlavor): string => {
  if (isSelectQuery(table)) return `(${table.toSQL(flavor)})`;
  return flavor.escapeTable(table);
};

export class QueryBase implements ISequelizable {
  protected _tables: Table[] = [];
  protected _joins: Join[] = [];

  // @ts-ignore
  public get table(): Table {
    if (this._tables.length === 0) throw new Error("No table defined");
    return this._tables[0];
  }
  public get tables(): Table[] {
    return this._tables;
  }
  public from(table: TableSource, alias?: string): this {
    const clone = this.clone();
    if (isSelectQuery(table)) {
      clone._tables = [new Table(table.clone(), alias)];
    } else {
      clone._tables = [new Table(table, alias)];
    }
    return clone;
  }

  public getTableNames(): string[] {
    return [
      ...this._tables.map((t) => t.getTableName()),
      ...this._joins.map((j) => j.getTableName()),
    ];
  }

  /**
   * join function to join tables with all join types
   */
  join(
    table: Table,
    condition?: Condition,
    type: "INNER" | "LEFT" | "RIGHT" | "FULL" = "INNER"
  ): this {
    const clone = this.clone();
    clone._joins.push(new Join(table, condition, type));
    return clone;
  }
  innerJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "INNER");
  }
  leftJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "LEFT");
  }
  rightJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "RIGHT");
  }
  fullJoin(table: Table, condition: Condition): this {
    return this.join(table, condition, "FULL");
  }

  public clone(): this {
    const clone = new (this.constructor as any)();
    clone._tables = [...this._tables.map((t) => t.clone())];
    clone._joins = [...this._joins.map((j) => j.clone())];
    return clone;
  }

  toSQL(flavor: ISQLFlavor): string {
    return this.tables.length > 0
      ? `FROM ${this.tables.map((table) => table.toSQL(flavor)).join(",")}`
      : "";
  }
}

class Join {
  protected _type: "INNER" | "LEFT" | "RIGHT" | "FULL";
  protected _table: Table;
  protected _condition?: Condition;

  constructor(
    table: Table,
    condition?: Condition,
    type: "INNER" | "LEFT" | "RIGHT" | "FULL" = "INNER"
  ) {
    this._table = table;
    this._condition = condition;
    this._type = type;
  }

  public clone(): this {
    const clone = new (this.constructor as any)(
      this._table,
      this._condition,
      this._type
    );
    return clone;
  }

  public getTableName(): string {
    return this._table.getTableName();
  }

  toSQL(flavor: ISQLFlavor): string {
    return `${this._type} JOIN ${this._table.toSQL(flavor)}${
      this._condition ? ` ON ${this._condition.toSQL(flavor)}` : ""
    }`;
  }

  toJSON(): any {
    return {
      type: "Join",
      table: this._table.toJSON(),
      condition: this._condition?.toJSON(),
      joinType: this._type,
    };
  }
  static fromJSON(json: any): Join {
    return new Join(
      Table.fromJSON(json.table),
      json.condition && Condition.fromJSON(json.condition),
      json.joinType
    );
  }
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
  static deserialize(json: string): Join {
    return Join.fromJSON(JSON.parse(json));
  }
}

interface SelectField {
  name: string;
  alias?: string;
}

interface Order {
  field: string;
  direction: "ASC" | "DESC";
}

class SelectBaseQuery extends QueryBase {
  protected _fields: SelectField[] = [];

  public clone(): this {
    const clone = super.clone();
    clone._fields = [...this._fields];
    return clone;
  }

  // @deprecated please use addFields
  field(name: string, alias?: string): this {
    return this.addFields([{ name, alias }]);
  }
  // add singleField
  addField(name: string, alias?: string): this {
    return this.addFields([{ name, alias }]);
  }
  // add multiple fields
  addFields(fields: SelectField[]): this {
    const clone = this.clone();
    clone._fields.push(...fields);
    return clone;
  }
  removeFields(): this {
    return this.fields([]);
  }
  // reset fields
  fields(fields: SelectField[]): this {
    const clone = this.clone();
    clone._fields = [...fields];
    return clone;
  }

  toSQL(flavor: ISQLFlavor): string {
    const columns =
      this._fields.length > 0
        ? this._fields
            .map(
              (f) =>
                `${flavor.escapeColumn(f.name)}${
                  f.alias ? ` AS ${flavor.escapeColumn(f.alias)}` : ""
                }`
            )
            .join(", ")
        : "*";
    return `SELECT ${columns} ${super.toSQL(flavor)}`;
  }
}

export enum UnionType {
  UNION = "UNION",
  UNION_ALL = "UNION ALL",
}

export class SelectQuery extends SelectBaseQuery implements ISerializable {
  protected _where: Condition[] = [];
  protected _having: Condition[] = [];
  protected _limit?: number;
  protected _offset?: number;
  protected _orderBy: Order[] = [];
  protected _groupBy: string[] = [];
  protected _unionQueries: { query: SelectQuery; type: UnionType }[] = [];

  public clone(): this {
    const clone = super.clone();
    clone._where = [...this._where];
    clone._having = [...this._having];
    clone._limit = this._limit;
    clone._offset = this._offset;
    clone._orderBy = [...this._orderBy];
    clone._groupBy = [...this._groupBy];
    clone._unionQueries = this._unionQueries.map((u) => ({
      query: u.query.clone(),
      type: u.type,
    }));
    return clone;
  }

  where(condition: Condition): this {
    const clone = this.clone();
    clone._where.push(condition);
    return clone;
  }
  having(condition: Condition): this {
    const clone = this.clone();
    clone._having.push(condition);
    return clone;
  }

  public getLimit(): number | undefined {
    return this._limit;
  }
  clearLimit(): this {
    const clone = this.clone();
    clone._limit = undefined;
    return clone;
  }
  limit(limit: number): this {
    const clone = this.clone();
    clone._limit = limit;
    return clone;
  }

  public getOffset(): number | undefined {
    return this._offset;
  }
  clearOffset(): this {
    const clone = this.clone();
    clone._offset = undefined;
    return clone;
  }
  offset(offset: number): SelectQuery {
    const clone = this.clone();
    clone._offset = offset;
    return clone;
  }
  public getOrderBy(): Order[] {
    return this._orderBy;
  }
  orderBy(field: string, direction: "ASC" | "DESC" = "ASC"): this {
    const clone = this.clone();
    clone._orderBy.push({ field, direction });
    return clone;
  }
  removeOrderBy(): this {
    const clone = this.clone();
    clone._orderBy = [];
    return clone;
  }
  public getGroupBy(): string[] {
    return this._groupBy;
  }
  groupBy(...field: string[]): this {
    const clone = this.clone();
    clone._groupBy.push(...field);
    return clone;
  }
  removeGroupBy(): this {
    const clone = this.clone();
    clone._groupBy = [];
    return clone;
  }
  public union(query: SelectQuery, type: UnionType = UnionType.UNION): this {
    const clone = this.clone();
    clone._unionQueries.push({ query, type });
    return clone;
  }

  public getTableNames(): string[] {
    return Array.from(
      new Set([
        ...super.getTableNames(),
        ...this._unionQueries.reduce(
          (acc, u) => [...acc, ...u.query.getTableNames()],
          [] as string[]
        ),
      ])
    );
  }

  toSQL(flavor: ISQLFlavor = flavors.mysql): string {
    let sql = super.toSQL(flavor);

    if (this._joins.length > 0) {
      sql += ` ${this._joins.map((j) => j.toSQL(flavor)).join(" ")}`;
    }
    if (this._where.length > 0) {
      sql += ` WHERE ${this._where.map((w) => w.toSQL(flavor)).join(" AND ")}`;
    }
    if (this._groupBy.length > 0) {
      sql += ` GROUP BY ${this._groupBy
        .map((c) => flavor.escapeColumn(c))
        .join(", ")}`;
    }
    if (this._having.length > 0) {
      sql += ` HAVING ${this._having
        .map((w) => w.toSQL(flavor))
        .join(" AND ")}`;
    }
    if (this._orderBy.length > 0) {
      sql += ` ORDER BY ${this._orderBy
        .map((o) => `${flavor.escapeColumn(o.field)} ${o.direction}`)
        .join(", ")}`;
    }
    if (this._limit) {
      sql += ` LIMIT ${this._limit}`;
    }
    if (this._offset) {
      sql += ` OFFSET ${this._offset}`;
    }
    this._unionQueries.forEach((unionQuery) => {
      sql =
        `(` + sql + `) ${unionQuery.type} (${unionQuery.query.toSQL(flavor)})`;
    });
    return sql;
  }

  // serialization
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
  toJSON(): any {
    return {
      type: "SelectQuery",
      tables: this._tables.map((table) =>
        typeof table === "string" ? table : table.toJSON()
      ),
      unionQueries: this._unionQueries.map((u) => ({
        type: u.type,
        query: u.query.toJSON(),
      })),
      joins: this._joins.map((join) => join.toJSON()),
      fields: this._fields,
      where: this._where.map((condition) => condition.toJSON()),
      having: this._having.map((condition) => condition.toJSON()),
      limit: this._limit,
      offset: this._offset,
      orderBy: this._orderBy,
      groupBy: this._groupBy,
    };
  }
  static fromJSON(json: any): SelectQuery {
    const query = new SelectQuery();
    query._tables = json.tables.map((table: any) => {
      return Table.fromJSON(table);
    });
    query._unionQueries = (json.unionQueries || []).map((u: any) => ({
      type: u.type,
      query: SelectQuery.fromJSON(u.query),
    }));
    query._joins = (json.joins || []).map((joinJson: any) =>
      Join.fromJSON(joinJson)
    );
    query._fields = json.fields;
    query._where = (json.where || []).map((conditionJson: any) =>
      Condition.fromJSON(conditionJson)
    );
    query._having = (json.having || []).map((conditionJson: any) =>
      Condition.fromJSON(conditionJson)
    );
    query._limit = json.limit;
    query._offset = json.offset;
    query._orderBy = json.orderBy ?? [];
    query._groupBy = json.groupBy ?? [];
    return query;
  }
}

const deserialize = (json: string) => {
  try {
    const parsed = JSON.parse(json);
    switch (parsed.type) {
      case "SelectQuery":
        return SelectQuery.fromJSON(parsed);
      case "DeleteMutation":
        return DeleteMutation.fromJSON(parsed);
      case "InsertMutation":
        return InsertMutation.fromJSON(parsed);
      case "UpdateMutation":
        return UpdateMutation.fromJSON(parsed);
      default:
        throw new Error("Unknown mutation type");
    }
  } catch (e) {
    throw new Error(`Error parsing query: ${(e as Error).message}`);
  }
};

export const Query = {
  table: (name: string, alias?: string) => new Table(name, alias),
  select: () => {
    return new SelectQuery();
  },
  stats: () => new SelectQuery().from("(?)", "t"),
  delete: (from: string, alias?: string) => new DeleteMutation(from, alias),
  update: (table: string, alias?: string) => new UpdateMutation(table, alias),
  insert: (into: string) => new InsertMutation(into),
  deserialize,
  flavors,
};

// for shorter syntax
export { Query as Q };
