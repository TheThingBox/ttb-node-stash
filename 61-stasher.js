module.exports = function(RED) {

	function Stasher(config) {
		RED.nodes.createNode(this, config);

		this.name = config.name;
		this.duration = config.duration;
		this.stash = {};

		if(typeof this.duration == "string")
			this.duration = parseInt(this.duration);
		if(typeof this.duration != "number")
			this.duration = 3600000;

		this.getStashKey = function(key) {
			if(!key || typeof key != "string") key = "default";
			var stash = this.stash[key];
			if(!stash) {
				stash = this.stash[key] = { working: false, pile: [] };
			}
			return this.stash[key];
		}

		this.isWorking = function(key) { return this.getStashKey(key).working; }

		this.work = function(key) {
			var stash = this.getStashKey(key);
			stash.working = true;
		}

		this.sleep = function(key) {
			var stash = this.getStashKey(key);
			stash.working = false;
		}

		this.stack = function(key, e, m) {
			var stash = this.getStashKey(key); 
			stash.pile.push({event: e, msg: m})
		}

		this.unstack = function(key) {
			var stashed = this.getStash(key);
			if(!stashed) return;
			var stash = this.getStashKey(key); 
			stash.pile.forEach(function(x) {
				x.msg.payload = stashed;
				process.nextTick(function() { RED.events.emit(x.event, x.msg); });
			});
			stash.pile = [];
		}

		this.getStash = function(key) {
			var stash = this.getStashKey(key);
			if(!stash.stash) return null;
			if(!stash.stash.date) return null;
			if(!stash.stash.payload) return null;
			var d = stash.stash.date+this.duration;
			if(d > Date.now()) return stash.stash.payload;
			return null;
		}

		this.setStash = function(key, payload) {
			var stash = this.getStashKey(key);
			stash.stash = {
				payload: payload,
				date: Date.now()
			};
		}
	}
	RED.nodes.registerType("stasher", Stasher);

	function StasherIn(config) {
		RED.nodes.createNode(this, config);

		this.on("input", function(msg) {
			var stashout = RED.nodes.getNode(config.out);
			if(stashout && stashout.stash) {
				if(!msg.key || typeof msg.key != "string") msg.key = "default";
				var stashed = stashout.stash.getStash(msg.key);
				var event = `node:${stashout.id}`;
				if(stashed) {
					msg.payload = stashed;
					RED.events.emit(event, msg);
					return;
				} else if(stashout.stash.isWorking(msg.key)) {
					stashout.stash.stack(msg.key, event, msg);
					return;
				}
				stashout.stash.work(msg.key);
			}
			this.send(msg);
		});
	}
	RED.nodes.registerType("stasher-in", StasherIn);

	function StasherOut(config) {
		RED.nodes.createNode(this, config);

		this.stash = RED.nodes.getNode(config.stash);

		var event = `node:${config.id}`;

		var handler = function(msg) {
			msg._event = event;
			this.receive(msg);
		}.bind(this);

		RED.events.on(event, handler);

		this.on("input", function(msg) {
			if(!msg._event || msg._event != event) {
				if(!msg.key || typeof msg.key != "string") msg.key = "default";
				this.stash.setStash(msg.key, msg.payload);
				this.stash.sleep(msg.key);
				this.stash.unstack(msg.key);
			}
			this.send(msg);
		});

		this.on("close", function() {
			RED.events.removeListener(event, handler);
		});
	}
	RED.nodes.registerType("stasher-out", StasherOut);

}