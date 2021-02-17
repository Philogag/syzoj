import * as TypeORM from "typeorm";
import Model from "./common";

import * as fs from "fs-extra";

declare var syzoj, ErrorMessage: any;

@TypeORM.Entity()
export default class Image extends Model {
  @TypeORM.PrimaryGeneratedColumn()
  id: number;

  @TypeORM.Index({ unique: true })
  @TypeORM.Column({ nullable: true, type: "varchar", length: 80 })
  filename: string;

  @TypeORM.Column({ nullable: true, type: "varchar", length: 80 })
  manager: string;

  @TypeORM.Column({ nullable: true, type: "varchar", length: 80 })
  name: string;

  getURL() {
    return "/image/" + this.filename;
  }

  getPath() {
    return Image.resolvePath(this.filename);
  }

  static resolvePath(name) {
    return syzoj.utils.resolvePath(syzoj.config.upload_dir, "static/image", name);
  }
}
