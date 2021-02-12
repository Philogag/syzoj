import * as TypeORM from "typeorm";
import Model from "./common";

import User from "./user";
import GroupUser from "./group_user";
import Contest from "./contest";

declare var syzoj, ErrorMessage: any;

@TypeORM.Entity()
export default class Group extends Model {
    static cache = true;

    @TypeORM.PrimaryGeneratedColumn()
    id: number;

    @TypeORM.Column({ nullable: true, type: "varchar", length: 120 })
    name: string;

    @TypeORM.ManyToMany(type => Contest, allowedContest => Contest.allowedGroup)
    allowedContest: Contest[];

    async allowVisitAndEditBy(user: User) {
        if (user.is_admin) {
            return true;
        } else if (user.is_teacher){
            let is_admin = await GroupUser.find({ gid: this.id, uid: user.id, is_admin: true });
            if (is_admin && is_admin.length > 0)
                return true;
            else
                return false;
        }
        return false;
    }
}