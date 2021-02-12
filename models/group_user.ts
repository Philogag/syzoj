import * as TypeORM from "typeorm";
import Model from "./common";

declare var syzoj: any;

@TypeORM.Entity()
export default class GroupUser extends Model {
    static cache = true;

    @TypeORM.PrimaryGeneratedColumn()
    id: number;

    @TypeORM.Index()
    @TypeORM.Column({ nullable: true, type: "integer" })
    gid: number;

    @TypeORM.Index()
    @TypeORM.Column({ nullable: true, type: "integer" })
    uid: number;

    @TypeORM.Column({ nullable: true, type: "boolean", default: false })
    is_admin: boolean;
}