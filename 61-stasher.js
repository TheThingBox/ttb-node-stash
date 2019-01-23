module.exports = function(RED) {

	function Stasher(config) {
		RED.nodes.createNode(this, config);

		this.name = config.name;
		this.duration = config.duration;
		this.working = false;
		this.pile = [];

		this.isWorking = function() { return this.working; }
		this.work = function() { this.working = true; }
		this.sleep = function() { this.working = false; }
		this.stack = function(e, m) { this.pile.push({event: e, msg: m})}
		this.unstack = function() {
			var stashed = this.getStash();
			if(!stashed) return;
			this.pile.forEach(function(x) {
				x.msg.payload = stashed;
				process.nextTick(function() { RED.events.emit(x.event, x.msg); });
			});
			this.pile = [];
		}

		this.getStash = function() {
			if(!this.stash) return null;
			if(!this.stash.date) return null;
			if(!this.stash.payload) return null;
			var d = this.stash.date+this.duration;
			if(d > Date.now()) return this.stash.payload;
			return null;
		}

		this.setStash = function(payload) {
			this.stash = {
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
				var stashed = stashout.stash.getStash();
				var event = `node:${stashout.id}`;
				if(stashed) {
					msg.payload = stashed;
					RED.events.emit(event, msg);
					return;
				} else if(stashout.stash.isWorking()) {
					stashout.stash.stack(event, msg);
					return;
				}
				stashout.stash.work();
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
			msg._event = config.event;
			this.receive(msg);
		}.bind(this);

		RED.events.on(event, handler);

		this.on("input", function(msg) {
			if(!msg._event || msg._event != config.event) {
				this.stash.setStash(msg.payload);
				this.stash.sleep();
				this.stash.unstack();
			}
			this.send(msg);
		});

		this.on("close", function() {
			RED.events.removeListener(event, handler);
		});
	}
	RED.nodes.registerType("stasher-out", StasherOut);

}