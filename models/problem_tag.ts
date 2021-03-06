import * as TypeORM from "typeorm";
import Model from "./common";

import ProblemTagGroup from "./problem_tag_group"
import ProblemTagMap from "./problem_tag_map"
@TypeORM.Entity()
export default class ProblemTag extends Model {
  static cache = true;

  @TypeORM.PrimaryGeneratedColumn()
  id: number;

  @TypeORM.Index({ unique: true })
  @TypeORM.Column({ nullable: true, type: "varchar", length: 255 })
  name: string;

  @TypeORM.Column({ nullable: true, type: "varchar", length: 255 })
  color: string;

  @TypeORM.ManyToOne(() => ProblemTagGroup, group => group.tags)
  group: ProblemTagGroup;

  async destroy() {
    const id = (this as any).id;
    let maps = await ProblemTagMap.find({ tag_id: id });
    if (maps && maps.length > 0) {
      await Promise.all(maps.map(async (x) => { await x.destroy();}))
    }
    await TypeORM.getManager().remove(this);
    await (this.constructor as typeof Model).deleteFromCache(id);
  }
}
