let User = syzoj.model('user');
const Contest = syzoj.model('contest');
const ContestPlayer = syzoj.model('contest_player');
const Group = syzoj.model('group');
const GroupUser = syzoj.model("group_user");

const url = require('url');
const jwt = require('jsonwebtoken');

// view user list for admin
app.get('/admin/users', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isTeacherAdmin()) throw new ErrorMessage('您没有权限执行此操作。');
        let where = {};
    
        let paginate = syzoj.utils.paginate(await User.countForPagination(where), req.query.page, 20);
        let userlist = await User.queryPage(paginate, where, {});
        
        res.render('manage/user/index', {
          userlist: userlist,
          paginate: paginate
        })
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

// edit one user 
app.post('/admin/user/edit/:id', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isTeacherAdmin()) throw new ErrorMessage('您没有权限执行此操作。');

        let goalUser = await User.findById(parseInt(req.params.id));

        // console.log(req.body);
        
        if (req.body.password)
            goalUser.password = req.body.password;
        
        goalUser.nickname = req.body.nickname;
        goalUser.realname = req.body.realname;
        goalUser.is_show = (req.body.is_show === 'on');
        goalUser.can_login = (req.body.can_login === 'on');
        // console.log(goalUser);
        await goalUser.save();
        res.send({
            success: true, user: {
                id: goalUser.id,
                username: goalUser.username,
                nickname: goalUser.nickname,
                realname: goalUser.realname,
                is_show: goalUser.is_show,
                can_login: goalUser.can_login
            }
        });
    } catch (e) {
        syzoj.log(e);
        res.send({ success: false });
    }
});

// update or create many users once
app.post('/admin/user/operate_many', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isTeacherAdmin()) throw new ErrorMessage('您没有权限执行此操作。');

        let create_cnt = 0; let update_cnt = 0;
        let failed = [];
        for (let row of req.body.users) {
            // console.log(row);
            goalUser = await User.find({ username: row.username });
            if (!goalUser || goalUser.length === 0) { // Create
                create_cnt++;
                goalUser = await User.create({
                    username: row.username,
                    password: row.password,
                    nickname: row.nickname,
                    realname: row.realname,
                    is_show: syzoj.config.default.user.show,
                    rating: syzoj.config.default.user.rating,
                    register_time: parseInt((new Date()).getTime() / 1000),
                    creater: curUser.id
                })
            } else { // update
                update_cnt++;
                goalUser = goalUser[0];
        
                goalUser.username = row.useranme;
                goalUser.password = row.password;
                goalUser.nickname = row.nickname;
                goalUser.realname = row.realname;
            }
            await goalUser.save();
        }
        msg = 'Update: ' + update_cnt + ', Create: ' + create_cnt + '\n';
        msg += 'Failed: ' + failed.length + '\n' + failed;
        syzoj.log(msg);
        res.send({ success: true, msg: msg });
    } catch (e) {
        syzoj.log(e);
        res.send({ success: false, msg: e });
    }
});

// view list of groups
app.get('/admin/groups', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isTeacherAdmin()) throw new ErrorMessage('您没有权限执行此操作。');

        let groups = null;
        if (curUser.is_admin) {
            groups = await Group.find();
        } else {
            let gus = await GroupUser.find({ where: { uid: curUser.id, is_admin: true }, order: { id: 'ASC' } });
            groups = await Promise.all(gus.map(async (gu) => {
                return await Group.findById(gu.gid);
            }));
        }

        res.render('manage/group/index', {
            groups: groups
        })
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

// visit a group or create a group
app.get('/admin/groups/:id', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isTeacherAdmin()) throw new ErrorMessage('您没有权限执行此操作。');

        let gid = parseInt(req.params.id);
        let group = null;
        if (gid === 0) { // new
            group = await Group.create({name: "New Group"});
            await group.save();
            gadmin = await GroupUser.create({ gid: group.id, uid: curUser.id, is_admin: true });
            await gadmin.save();
            res.redirect(syzoj.utils.makeUrl(['admin', 'groups', group.id]));
        }else{
            group = await Group.findById(gid);
            if (!group.allowVisitAndEditBy(curUser)) throw new ErrorMessage('您没有权限操作这个组。');

            gadmins = await GroupUser.find({ where: { gid: gid, is_admin: true } , order: { uid: 'ASC' }});
            gusers = await GroupUser.find({ where: { gid: gid, is_admin: false } , order: { uid: 'ASC' }});

            gadmins = await Promise.all(gadmins.map(async (gu) => {return await User.findById(gu.uid); }));
            gusers = await Promise.all(gusers.map(async (gu) => {return await User.findById(gu.uid); }));

            res.render('manage/group/id', {
                group: group,
                gadmins: gadmins,
                gusers: gusers,
            });
        }
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    };
});

// rename or delete a group
app.post('/admin/groups/:id', async (req, res) => {
    try {
        let curUser = res.locals.user;
        // lot login or do not have admin permission.
        if (!curUser || !curUser.isTeacherAdmin()) throw new ErrorMessage('您没有权限执行此操作。');

        let gid = parseInt(req.params.id);
        let group = null;
        if (gid === -1) {
            res.send({ success: false, msg: "组不存在." });
        }else{
            group = await Group.findById(gid);
            if (!group.allowVisitAndEditBy(curUser)) throw new ErrorMessage('您没有权限操作这个组。');
        }
        // console.log(req.body);

        let msg = '';
        let succ_cnt = 0;
        switch (req.body.operation) {
            case 'rename':
                group.name = req.body.name;
                await group.save();
                msg = "Rename success.";
                break;
            case 'delete':
                groupusers = await GroupUser.find({ gid: group.id });
                await Promise.all(groupusers.map(async (gu) => { await gu.destroy(); succ_cnt++; }))
                await group.destroy();
                group = null;
                msg = 'Delete group and group user success.\n' + succ_cnt + ' group users have been deleted.';
                break;
        }

        res.send({ success: true , msg: msg, group: group});
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});


// add or remove the user-group relationship
app.post('/admin/groups/:id/user', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isTeacherAdmin()) throw new ErrorMessage('您没有权限执行此操作。');

        let gid = parseInt(req.params.id);
        let group = null;
        if (gid === -1) {
            res.send({ success: false, msg: "组不存在." });
        }else{
            group = await Group.findById(gid);
            if (!group.allowVisitAndEditBy(curUser)) throw new ErrorMessage('您没有权限操作这个组。');
        }

        let succ_cnt = 0;
        let fail_cnt = 0;
        uids = await Promise.all(req.body.data.map(async (u) => {
            o = await User.find({ username: u.username })
            if (!o || o.length === 0) { fail_cnt++; return null; }
            return {
                uid: o[0].id,
                gid: group.id,
                is_admin: u.is_admin === 'true'
            };
        }));

        switch (req.body.operation) {
            case 'update':
                await Promise.all(uids.map(async (row) => {
                    gu = await GroupUser.find({ gid: row.gid, uid: row.uid });
                    if (!gu || gu.length === 0) {
                        gu = await GroupUser.create(row);
                    } else {
                        gu = gu[0];
                        gu.is_admin = row.is_admin; 
                    }
                    await gu.save();
                    succ_cnt++;
                }))
                break;
            case 'delete':
                await Promise.all(uids.map(async (row) => {
                    gu = await GroupUser.find({ gid: row.gid, uid: row.uid });
                    if (gu && gu.length > 0) {
                        await gu[0].destroy();
                        succ_cnt++;
                    } else {
                        fail_cnt ++;
                    }
                }))
                break;
        }
        msg = "Success: " + succ_cnt + "<br>Failed: " + fail_cnt;
        res.send({ success: true , msg: msg, group: group});
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});



// view teacher list for super admin
app.get('/admin/teachers', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isSuperAdmin()) throw new ErrorMessage('您没有权限执行此操作。');
        let where = {is_teacher: true};
    
        let paginate = syzoj.utils.paginate(await User.countForPagination(where), req.query.page, 20);
        let userlist = await User.queryPage(paginate, where, {});
        
        res.render('manage/teacher/index', {
          userlist: userlist,
          paginate: paginate
        })
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});


// edit user's teacher permission 
app.post('/admin/teacher/update', async (req, res) => {
    try {
        let curUser = res.locals.user;
        if (!curUser || !curUser.isSuperAdmin()) throw new ErrorMessage('您没有权限执行此操作。');

        let goalUser = await User.findById(req.body.uid);
        
        // console.log(goalUser);
        goalUser.is_teacher = (req.body.enable === 'true');
        await goalUser.save();
        
        res.send({
            success: true, user: {
                id: goalUser.id,
                username: goalUser.username,
                nickname: goalUser.nickname,
                realname: goalUser.realname
            }
        });
    } catch (e) {
        syzoj.log(e);
        res.send({ success: false });
    }
});