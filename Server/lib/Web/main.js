var WS		 = require("ws");
var Express	 = require("express");
var Exession = require("express-session");
var Redission= require("connect-redis")(Exession);
var Redis	 = require("redis");
var Parser	 = require("body-parser");
var DDDoS	 = require("dddos");
var Server	 = Express();
var DB		 = require("./db");
var JAuth	 = require("../sub/jauth");
var JLog	 = require("../sub/jjlog");
JLog.init("web");
var WebInit	 = require("../sub/webinit");
var GLOBAL	 = require("../sub/global.json");
var Const	 = require("../const");

var Language = {
	'ko_KR': require("./lang/ko_KR.json"),
	'en_US': require("./lang/en_US.json")
};
var ROUTES = [
	"major", "consume", "admin"
];
var page = WebInit.page;
var gameServers = [];

WebInit.MOBILE_AVAILABLE = [
	"portal", "main", "kkutu"
];

require("../sub/checkpub");

JLog.info("<< KKuTu Web >>");
Server.set('views', __dirname + "/views");
Server.set('view engine', "pug");
Server.use(Express.static(__dirname + "/public"));
Server.use(Parser.urlencoded({ extended: true }));
Server.use(Exession({
	store: new Redission({
		client: Redis.createClient(),
		ttl: 3600 * 12
	}),
	secret: 'kkutu',
	resave: false,
	saveUninitialized: true
}));
DDDoS = new DDDoS({
	maxWeight: 6,
	checkInterval: 10000,
	rules: [{
		regexp: "^/(cf|dict|gwalli)",
		maxWeight: 20,
		errorData: "429 Too Many Requests"
	}, {
		regexp: ".*",
		errorData: "429 Too Many Requests"
	}]
});
DDDoS.rules[0].logFunction = DDDoS.rules[1].logFunction = function(ip, path){
	JLog.warn(`DoS from IP ${ip} on ${path}`);
};
Server.use(DDDoS.express());

WebInit.init(Server, true);
DB.ready = function(){
	setInterval(function(){
		var q = [ 'createdAt', { $lte: Date.now() - 3600000 * 12 } ];
		
		DB.session.remove(q).on();
	}, 600000);
	setInterval(function(){
		gameServers.forEach(function(v){
			if(v.socket) v.socket.send(`{"type":"seek"}`);
			else v.seek = undefined;
		});
	}, 4000);
	JLog.success("DB is ready.");
	
	DB.kkutu_shop_desc.find().on(function($docs){
		var i, j;
		
		for(i in Language) flush(i);
		function flush(lang){
			var db;
			
			Language[lang].SHOP = db = {};
			for(j in $docs){
				db[$docs[j]._id] = [ $docs[j][`name_${lang}`], $docs[j][`desc_${lang}`] ];
			}
		}
	});
	Server.listen(80);
};
Const.MAIN_PORTS.forEach(function(v, i){
	var KEY = process.env['WS_KEY'];
	
	gameServers[i] = new GameClient(KEY, `ws://127.0.0.2:${v}/${KEY}`);
});
function GameClient(id, url){
	var my = this;
	
	my.id = id;
	my.socket = new WS(url, { perMessageDeflate: false });
	
	my.send = function(type, data){
		if(!data) data = {};
		data.type = type;
		
		my.socket.send(JSON.stringify(data));
	};
	my.socket.on('open', function(){
		JLog.info(`Game server #${my.id} connected`);
	});
	my.socket.on('error', function(err){
		JLog.warn(`Game server #${my.id} has an error: ${err.toString()}`);
	});
	my.socket.on('close', function(code){
		JLog.error(`Game server #${my.id} closed: ${code}`);
		my.socket.removeAllListeners();
		delete my.socket;
	});
	my.socket.on('message', function(data){
		var _data = data;
		var i;
		
		data = JSON.parse(data);
		
		switch(data.type){
			case "seek":
				my.seek = data.value;
				break;
			case "narrate-friend":
				for(i in data.list){
					gameServers[i].send('narrate-friend', { id: data.id, s: data.s, stat: data.stat, list: data.list[i] });
				}
				break;
			case "yell":
				for(var j=0;j<gameServers.length;j++){
					gameServers[j].send('yell', { value: data.value, bar : data.bar });
				}
				break;
			default:
		}
	});
}
ROUTES.forEach(function(v){
	require(`./routes/${v}`).run(Server, WebInit.page);
});
Server.get("/discord",function(req,res){
	return res.redirect("https://discord.gg/dNmtmhw");
});
Server.get("/facebook",function(req,res){
	return res.redirect("//www.facebook.com/kkutukorea/");
});
Server.get("/", function(req, res){
	var server = req.query.server;
	var before = req.query.before;
	
	if(req.query.code){ // 네이버 토큰
		req.session.authType = "naver";
		req.session.token = req.query.code;
		res.redirect("/register?before="+(before?before:"/"));
	}else if(req.query.token){ // 페이스북 토큰
		req.session.authType = "facebook";
		req.session.token = req.query.token;
		res.redirect("/register?before="+(before?before:"/"));
	}else{
		DB.session.findOne([ '_id', req.session.id ]).on(function($ses){
			// var sid = (($ses || {}).profile || {}).sid || "NULL";
			if(global.isPublic){
				onFinish($ses);
				// DB.jjo_session.findOne([ '_id', sid ]).limit([ 'profile', true ]).on(onFinish);
			}else{
				if($ses) $ses.profile.sid = $ses._id;
				onFinish($ses);
			}
		});
	}
	function onFinish($doc){
		var id = req.session.id;
		
		if($doc){
			req.session.profile = $doc.profile;
			id = $doc.profile.sid;
		}else{
			delete req.session.profile;
		}
		page(req, res, Const.MAIN_PORTS[server] ? "kkutu" : "portal", {
			'_page': "kkutu",
			'_id': id,
			'PORT': Const.MAIN_PORTS[server],
			'HOST': req.hostname,
			'TEST': req.query.test,
			'MOREMI_PART': Const.MOREMI_PART,
			'AVAIL_EQUIP': Const.AVAIL_EQUIP,
			'CATEGORIES': Const.CATEGORIES,
			'GROUPS': Const.GROUPS,
			'MODE': Const.GAME_TYPE,
			'RULE': Const.RULE,
			'OPTIONS': Const.OPTIONS,
			'KO_INJEONG': Const.KO_INJEONG,
			'EN_INJEONG': Const.EN_INJEONG,
			'KO_THEME': Const.KO_THEME,
			'EN_THEME': Const.EN_THEME,
			'IJP_EXCEPT': Const.IJP_EXCEPT,
			'ogImage': "http://kkutu.co.kr/kkutukorea.png",
			'ogURL': "http://kkutu.co.kr/",
			'ogTitle': "끄투코리아 - 끝말잇기 온라인",
			'ogDescription': "끝말잇기, 앞말잇기, 끄투, 십자말풀이 등 개꿀잼 게임!"
		});
	}
});
Server.get("/servers", function(req, res){
	var list = [];
	
	gameServers.forEach(function(v, i){
		if(v!=undefined&&v!=null&&v.seek!=undefined&&v.seek!=null) list.push(v.seek);
	});
	res.send({ list: list, max: Const.KKUTU_MAX });
});

Server.get("/login", function(req, res){
	var before = req.query.before;
	if(global.isPublic){
		page(req, res, "login", { '_id': req.session.id, 'text': req.query.desc, "before":before });
	}else{
		var now = Date.now();
		var id = req.query.id || "ADMIN";
		var lp = {
			id: id,
			title: "LOCAL #" + id,
			birth: [ 4, 16, 0 ],
			_age: { min: 20, max: undefined }
		};
		DB.session.upsert([ '_id', req.session.id ]).set([ 'profile', JSON.stringify(lp) ], [ 'createdAt', now ]).on(function($res){
			DB.users.update([ '_id', id ]).set([ 'lastLogin', now ]).on();
			req.session.admin = true;
			req.session.profile = lp;
			res.redirect("/");
		});
	}
});
Server.get("/logout", function(req, res){
	var before = req.query.before;
	if(!req.session.profile){
		return res.redirect(before?before:"/");
	}
	JAuth.logout(req.session.profile).then(function(){
		delete req.session.profile;
		DB.session.remove([ '_id', req.session.id ]).on(function($res){
			res.redirect(before?before:"/");
		});
	});
});
Server.get("/register", function(req, res){
	var before = req.query.before;
	if(!req.session.token) return res.sendStatus(400);
	
	JAuth.login(req.session.authType, req.session.token, req.session.id, req.session.token2).then(function($profile){
		var now = Date.now();
		
		if($profile.error) return res.sendStatus($profile.error);
		if(!$profile.id) return res.sendStatus(401);
		
		$profile.sid = req.session.id;
		req.session.admin = GLOBAL.ADMIN.includes($profile.id);
		DB.session.upsert([ '_id', req.session.id ]).set({
			'profile': $profile,
			'createdAt': now
		}).on();
		DB.users.findOne([ '_id', $profile.id ]).on(function($body){
			req.session.profile = $profile;
			res.redirect(before?before:"/");
			DB.users.update([ '_id', $profile.id ]).set([ 'lastLogin', now ]).on();
		});
	});
});
Server.post("/login/google", function(req, res){
	req.session.authType = "google";
	req.session.token = req.body.it;
	req.session.token2 = req.body.at;
	res.sendStatus(200);
});
Server.post("/session", function(req, res){
	var o;
	
	if(req.session.profile) o = {
		authType: req.session.authType,
		createdAt: req.session.createdAt,
		profile: {
			id: req.session.profile.id,
			image: req.session.profile.image,
			name: req.session.profile.title || req.session.profile.name,
			sex: req.session.profile.sex
		}
	};
	else o = { error: 404 };
	res.json(o);
});
Server.post("/session/set", function(req, res){
	res.sendStatus(200);
});
Server.get("/legal/:page", function(req, res){
	page(req, res, "legal/"+req.params.page);
});