import * as TypeORM from "typeorm";
import Model from "./common";

import ProblemTag from "./problem_tag"

@TypeORM.Entity()
export default class ProblemTagGroup extends Model {
  static cache = true;

  @TypeORM.PrimaryGeneratedColumn()
  id: number;

  @TypeORM.Index({ unique: true })
  @TypeORM.Column({ nullable: true, type: "varchar", length: 255 })
  name: string;

  @TypeORM.Column({ nullable: true, type: "varchar", length: 255 })
  color: string;
    
  @TypeORM.OneToMany(() => ProblemTag, tag => tag.group)
  tags: ProblemTag[];

  async destroy() {
    const id = (this as any).id;
    let maps = await ProblemTag.find({ where: {group: this}});
    if (maps && maps.length > 0) {
      await Promise.all(maps.map(async (x) => { await x.destroy();}))
    }
    await TypeORM.getManager().remove(this);
    await (this.constructor as typeof Model).deleteFromCache(id);
  }
}
