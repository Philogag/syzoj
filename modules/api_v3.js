const jwt = require('jsonwebtoken');
const url = require('url');

// all the apis here is for admin page , so it need permission check

// admin user search engine, more infomation returned.
app.get("/api/v3/search/admins/:keyword*?", async (req, res) => {
    try {
        let User = syzoj.model('user');

        let keyword = decodeURI(req.params.keyword) || '';
        let conditions = [];
        const uid = parseInt(keyword) || 0;

        if (uid != null && !isNaN(uid)) {
            conditions.push({ id: uid, is_teacher: true}, { id: uid, is_admin: true});
        }
        if (keyword != null && keyword.length >= 0) {
            like = TypeORM.Like(`%${keyword}%`) 
            conditions.push({ username: like, is_teacher: true},{ username: like, is_admin: true});
            conditions.push({ nickname: like, is_teacher: true},{ username: like, is_admin: true});
            conditions.push({ realname: like, is_teacher: true},{ username: like, is_admin: true});
        }
        if (conditions.length === 0) {
            res.send({ success: true, results: [] });
        } else {
            let users = await User.find({
                where: conditions,
                order: {
                    id: 'ASC'
                }
            });

            let result = [];

            result = users.map(x => ({ name: '#' + x.id + '\t' + x.username + '\t' + x.nickname + '\t' + x.realname, value: x.id}));
            res.send({ success: true, results: result });
        }
    } catch (e) {
    syzoj.log(e);
    res.send({ success: false });
    }
});


app.get("/api/v3/search/users/:keyword*?", async (req, res) => {
    try {
        let User = syzoj.model('user');

        let keyword = decodeURI(req.params.keyword) || '';
        let conditions = [];
        const uid = parseInt(keyword) || 0;

        if (uid != null && !isNaN(uid)) {
            conditions.push({ id: uid });
        }
        if (keyword != null && keyword.length >= 0) {
            conditions.push({ username: TypeORM.Like(`%${keyword}%`) });
            conditions.push({ nickname: TypeORM.Like(`%${keyword}%`) });
            conditions.push({ realname: TypeORM.Like(`%${keyword}%`) });
        }
        if (conditions.length === 0) {
            res.send({ success: true, results: [] });
        } else {
            let users = await User.find({
                where: conditions,
                order: {
                    username: 'ASC'
                }
            });

            let result = [];

            result = users.map(x => ({ name: '#' + x.id + '\t' + x.username + '\t' + x.nickname + '\t' + x.realname, value: x.id}));
            res.send({ success: true, results: result });
        }
    } catch (e) {
    syzoj.log(e);
    res.send({ success: false });
    }
});

app.get("/api/v3/search/groups/:keyword*?", async (req, res) => {
    try {
        let Group = syzoj.model('group');

        let keyword = decodeURI(req.params.keyword) || '';
        let conditions = [];
        const uid = parseInt(keyword) || 0;

        if (uid != null && !isNaN(uid)) {
            conditions.push({ id: uid });
        }
        if (keyword != null && keyword.length >= 0) {
            conditions.push({ name: TypeORM.Like(`%${keyword}%`) });
        }
        if (conditions.length === 0) {
            res.send({ success: true, results: [] });
        } else {
            let groups = await Group.find({
                where: conditions,
                order: {
                    id: 'ASC'
                }
            });

            let result = [];

            result = groups.map(x => ({ name: '#' + x.id + '\t' + x.name , value: x.id}));
            res.send({ success: true, results: result });
        }
    } catch (e) {
    syzoj.log(e);
    res.send({ success: false });
    }
});