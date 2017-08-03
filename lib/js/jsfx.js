(function(root, factory) {
	if (typeof module === "object" && typeof module.exports === "object") {
		module.exports = factory();
	} else {
		root.jsfx = factory();
	}
}(this, function() {
	'use strict';

	var chr = String.fromCharCode;
	var TAU = +Math.PI * 2;
	var bitsPerSample = 16 | 0;
	var numChannels = 1 | 0;
	var sin = Math.sin;
	var pow = Math.pow;
	var abs = Math.abs;
	var EPSILON = 0.000001;

	var jsfx = {};
	var AudioContext = window.AudioContext || window.webkitAudioContext;

	jsfx.SampleRate = 0 | 0;
	jsfx.Sec = 0 | 0;

	jsfx.SetSampleRate = function(sampleRate) {
		jsfx.SampleRate = sampleRate | 0;
		jsfx.Sec = sampleRate | 0;
	};
	jsfx.SetSampleRate(getDefaultSampleRate());

	// MAIN API

	// Creates a new Audio object based on the params
	// params can be a params generating function or the actual parameters
	jsfx.Sound = function(params) {
		var processor = new Processor(params, jsfx.DefaultModules);
		var block = createFloatArray(processor.getSamplesLeft());
		processor.generate(block);
		return CreateAudio(block);
	};

	// Same as Sounds, but avoids locking the browser for too long
	// in case you have a large amount of sounds to generate
	jsfx.Sounds = function(library, ondone, onprogress) {
		var audio = {};
		var player = {};
		player._audio = audio;

		var toLoad = [];

		// create playing functions
		map_object(library, function(_, name) {
			player[name] = function() {
				if (typeof audio[name] !== "undefined") {
					audio[name].currentTime = 0.0;
					audio[name].play();
				}
			};
			toLoad.push(name);
		});

		var loaded = 0,
			total = toLoad.length;

		function next() {
			if (toLoad.length == 0) {
				ondone && ondone(sounds);
				return;
			}
			var name = toLoad.shift();
			audio[name] = jsfx.Sound(library[name]);
			loaded++;
			onprogress && onprogress(name, loaded, total);

			window.setTimeout(next, 30);
		}
		next();

		return player;
	}

	// SoundsImmediate takes a named set of params, and generates multiple
	// sound objects at once.
	jsfx.SoundsImmediate = function(library) {
		var audio = {};
		var player = {};
		player._audio = audio;
		map_object(library, function(params, name) {
			audio[name] = jsfx.Sound(params);
			player[name] = function() {
				if (typeof audio[name] !== "undefined") {
					audio[name].currentTime = 0.0;
					audio[name].play();
				}
			};
		})
		return player;
	};

	// FloatBuffer creates a FloatArray filled with audio
	jsfx.FloatBuffer = function(params, modules) {
		var processor = new Processor(params, jsfx.DefaultModules);
		var block = createFloatArray(processor.getSamplesLeft());
		processor.generate(block);
		return block;
	};

	if (typeof AudioContext !== "undefined") {
		// Node creates a new AudioContext ScriptProcessor that outputs the
		// sound. It will automatically disconnect, unless otherwise specified.
		jsfx.Node = function(audioContext, params, modules, bufferSize, stayConnected) {
			var node = audioContext.createScriptProcessor(bufferSize, 0, 1);
			var gen = new Processor(params, modules || jsfx.DefaultModules);
			node.onaudioprocess = function(ev) {
				var block = ev.outputBuffer.getChannelData(0);
				gen.generate(block);
				if (!stayConnected && gen.finished) {
					// we need to do an async disconnect, otherwise Chrome may
					// glitch
					setTimeout(function() {
						node.disconnect();
					}, 30);
				}
			}
			return node;
		}

		// AudioBuffer creates a buffer filled with the proper audio
		// This is useful, when you want to use AudioContext.BufferSource
		jsfx.AudioBuffer = function(audioContext, params, modules) {
			var processor = new Processor(params, modules || jsfx.DefaultModules);
			var buffer = audioContext.createBuffer(numChannels, processor.getSamplesLeft(), jsfx.SampleRate);
			var block = buffer.getChannelData(0);
			processor.generate(block);
			return buffer;
		};

		// Live creates an managed AudioContext for playing.
		// This is useful, when you want to use procedurally generated sounds.
		jsfx.Live = function(library, modules, BufferSize) {
			//TODO: add limit for number of notes played at the same time
			BufferSize = BufferSize || 2048;
			var player = {};

			var context = new AudioContext();
			var volume = context.createGain();
			volume.connect(context.destination);

			player._context = context;
			player._volume = volume;

			map_object(library, function(params, name) {
				player[name] = function() {
					var node = jsfx.Node(context, params, modules, BufferSize);
					node.connect(volume);
				};
			});

			player._close = function() {
				context.close();
			};

			player._play = function(params) {
				var node = jsfx.Node(context, params, modules, BufferSize);
				node.connect(volume);
			};

			return player;
		}
	} else {
		jsfx.Live = jsfx.Sounds;
	}

	// SOUND GENERATION
	jsfx.Module = {};

	// generators
	jsfx.G = {};

	var stage = jsfx.stage = {
		PhaseSpeed: 0,
		PhaseSpeedMod: 10,
		Generator: 20,
		SampleMod: 30,
		Volume: 40
	};

	function byStage(a, b) {
		return a.stage - b.stage;
	}

	jsfx.InitDefaultParams = InitDefaultParams;

	function InitDefaultParams(params, modules) {
		// setup modules
		for (var i = 0; i < modules.length; i += 1) {
			var M = modules[i];
			var P = params[M.name] || {};

			// add missing parameters
			map_object(M.params, function(def, name) {
				if (typeof P[name] === 'undefined') {
					P[name] = def.D;
				}
			});

			params[M.name] = P;
		}
	}

	// Generates a stateful sound effect processor
	// params can be a function that creates a parameter set
	jsfx.Processor = Processor;

	function Processor(params, modules) {
		params = params || {};
		modules = modules || jsfx.DefaultModules;

		if (typeof params === 'function') {
			params = params();
		} else {
			params = JSON.parse(JSON.stringify(params))
		}
		this.finished = false;

		this.state = {
			SampleRate: params.SampleRate || jsfx.SampleRate
		};

		// sort modules
		modules = modules.slice();
		modules.sort(byStage)
		this.modules = modules;

		// init missing params
		InitDefaultParams(params, modules);

		// setup modules
		for (var i = 0; i < this.modules.length; i += 1) {
			var M = this.modules[i];
			this.modules[i].setup(this.state, params[M.name]);
		}
	}
	Processor.prototype = {
		//TODO: see whether this can be converted to a module
		generate: function(block) {
			for (var i = 0 | 0; i < block.length; i += 1) {
				block[i] = 0;
			}
			if (this.finished) {
				return;
			}

			var $ = this.state,
				N = block.length | 0;
			for (var i = 0; i < this.modules.length; i += 1) {
				var M = this.modules[i];
				var n = M.process($, block.subarray(0, N)) | 0;
				N = Math.min(N, n);
			}
			if (N < block.length) {
				this.finished = true;
			}
			for (var i = N; i < block.length; i++) {
				block[i] = 0;
			}
		},
		getSamplesLeft: function() {
			var samples = 0;
			for (var i = 0; i < this.state.envelopes.length; i += 1) {
				samples += this.state.envelopes[i].N;
			}
			if (samples === 0) {
				samples = 3 * this.state.SampleRate;
			}
			return samples;
		}
	};

	// Frequency
	jsfx.Module.Frequency = {
		name: 'Frequency',
		params: {
			/* beautify preserve:start */
			Start: { L:30, H:1800, D:440  },

			Min: { L:30, H:1800, D:30    },
			Max: { L:30, H:1800, D:1800  },

			Slide:      { L:-1, H:1, D:0 },
			DeltaSlide: { L:-1, H:1, D:0 },

			RepeatSpeed:  { L:0, H: 3.0, D: 0 },

			ChangeAmount: { L:-12, H:12, D:0 },
			ChangeSpeed : { L:  0, H:1,  D:0 }
			/* beautify preserve:end */
		},
		stage: stage.PhaseSpeed,
		setup: function($, P) {
			var SR = $.SampleRate;

			$.phaseParams = P;

			$.phaseSpeed = P.Start * TAU / SR;
			$.phaseSpeedMax = P.Max * TAU / SR;
			$.phaseSpeedMin = P.Min * TAU / SR;

			$.phaseSpeedMin = Math.min($.phaseSpeedMin, $.phaseSpeed);
			$.phaseSpeedMax = Math.max($.phaseSpeedMax, $.phaseSpeed);

			$.phaseSlide = 1.0 + pow(P.Slide, 3.0) * 64.0 / SR;
			$.phaseDeltaSlide = pow(P.DeltaSlide, 3.0) / (SR * 1000);

			$.repeatTime = 0;
			$.repeatLimit = Infinity;
			if (P.RepeatSpeed > 0) {
				$.repeatLimit = P.RepeatSpeed * SR;
			}

			$.arpeggiatorTime = 0;
			$.arpeggiatorLimit = P.ChangeSpeed * SR;
			if (P.ChangeAmount == 0) {
				$.arpeggiatorLimit = Infinity;
			}
			$.arpeggiatorMod = 1 + P.ChangeAmount / 12.0;
		},
		process: function($, block) {
			var speed = +$.phaseSpeed,
				min = +$.phaseSpeedMin,
				max = +$.phaseSpeedMax,
				slide = +$.phaseSlide,
				deltaSlide = +$.phaseDeltaSlide;

			var repeatTime = $.repeatTime,
				repeatLimit = $.repeatLimit;

			var arpTime = $.arpeggiatorTime,
				arpLimit = $.arpeggiatorLimit,
				arpMod = $.arpeggiatorMod;

			for (var i = 0; i < block.length; i++) {
				slide += deltaSlide;
				speed *= slide;
				speed = speed < min ? min : speed > max ? max : speed;

				if (repeatTime > repeatLimit) {
					this.setup($, $.phaseParams);
					return i + this.process($, block.subarray(i)) - 1;
				}
				repeatTime++;

				if (arpTime > arpLimit) {
					speed *= arpMod;
					arpTime = 0;
					arpLimit = Infinity;
				}
				arpTime++;

				block[i] += speed;
			}

			$.repeatTime = repeatTime;
			$.arpeggiatorTime = arpTime;
			$.arpeggiatorLimit = arpLimit;

			$.phaseSpeed = speed;
			$.phaseSlide = slide;

			return block.length;
		}
	};

	// Vibrato
	jsfx.Module.Vibrato = {
		name: 'Vibrato',
		params: {
			/* beautify preserve:start */
			Depth:      {L: 0, H:1, D:0},
			DepthSlide: {L:-1, H:1, D:0},

			Frequency:      {L:  0.01, H:48, D:0},
			FrequencySlide: {L: -1.00, H: 1, D:0}
			/* beautify preserve:end */
		},
		stage: stage.PhaseSpeedMod,
		setup: function($, P) {
			var SR = $.SampleRate;
			$.vibratoPhase = 0;
			$.vibratoDepth = P.Depth;
			$.vibratoPhaseSpeed = P.Frequency * TAU / SR;

			$.vibratoPhaseSpeedSlide = 1.0 + pow(P.FrequencySlide, 3.0) * 3.0 / SR;
			$.vibratoDepthSlide = P.DepthSlide / SR;
		},
		process: function($, block) {
			var phase = +$.vibratoPhase,
				depth = +$.vibratoDepth,
				speed = +$.vibratoPhaseSpeed,
				slide = +$.vibratoPhaseSpeedSlide,
				depthSlide = +$.vibratoDepthSlide;

			if ((depth == 0) && (depthSlide <= 0)) {
				return block.length;
			}

			for (var i = 0; i < block.length; i++) {
				phase += speed;
				if (phase > TAU) {
					phase -= TAU
				};
				block[i] += block[i] * sin(phase) * depth;

				speed *= slide;
				depth += depthSlide;
				depth = clamp1(depth);
			}

			$.vibratoPhase = phase;
			$.vibratoDepth = depth;
			$.vibratoPhaseSpeed = speed;
			return block.length;
		}
	};

	// Generator
	jsfx.Module.Generator = {
		name: 'Generator',
		params: {
			/* beautify preserve:start */
			// C = choose
			Func: {C: jsfx.G, D:'square'},

			A: {L: 0, H: 1, D: 0},
			B: {L: 0, H: 1, D: 0},

			ASlide: {L: -1, H: 1, D: 0},
			BSlide: {L: -1, H: 1, D: 0}
			/* beautify preserve:end */
		},
		stage: stage.Generator,
		setup: function($, P) {
			$.generatorPhase = 0;

			if (typeof P.Func === 'string') {
				$.generator = jsfx.G[P.Func];
			} else {
				$.generator = P.Func;
			}
			if (typeof $.generator === 'object') {
				$.generator = $.generator.create();
			}
			assert(typeof $.generator === 'function', 'generator must be a function')

			$.generatorA = P.A;
			$.generatorASlide = P.ASlide;
			$.generatorB = P.B;
			$.generatorBSlide = P.BSlide;
		},
		process: function($, block) {
			return $.generator($, block);
		}
	};

	// Karplus Strong algorithm for string sound
	var GuitarBufferSize = 1 << 16;
	jsfx.Module.Guitar = {
		name: 'Guitar',
		params: {
			/* beautify preserve:start */
			A: {L:0.0, H:1.0, D: 1},
			B: {L:0.0, H:1.0, D: 1},
			C: {L:0.0, H:1.0, D: 1}
			/* beautify preserve:end */
		},
		stage: stage.Generator,
		setup: function($, P) {
			$.guitarA = P.A;
			$.guitarB = P.B;
			$.guitarC = P.C;

			$.guitarBuffer = createFloatArray(GuitarBufferSize);
			$.guitarHead = 0;
			var B = $.guitarBuffer;
			for (var i = 0; i < B.length; i++) {
				B[i] = Math.random() * 2 - 1;
			}
		},
		process: function($, block) {
			var BS = GuitarBufferSize,
				BM = BS - 1;

			var A = +$.guitarA,
				B = +$.guitarB,
				C = +$.guitarC;
			var T = A + B + C;
			var h = $.guitarHead;

			var buffer = $.guitarBuffer;
			for (var i = 0; i < block.length; i++) {
				// buffer size
				var n = (TAU / block[i]) | 0;
				n = n > BS ? BS : n;

				// tail
				var t = ((h - n) + BS) & BM;
				buffer[h] =
					(buffer[(t - 0 + BS) & BM] * A +
						buffer[(t - 1 + BS) & BM] * B +
						buffer[(t - 2 + BS) & BM] * C) / T;

				block[i] = buffer[h];
				h = (h + 1) & BM;
			}

			$.guitarHead = h;
			return block.length;
		}
	}

	// Low/High-Pass Filter
	jsfx.Module.Filter = {
		name: 'Filter',
		params: {
			/* beautify preserve:start */
			LP:          {L: 0, H:1, D:1},
			LPSlide:     {L:-1, H:1, D:0},
			LPResonance: {L: 0, H:1, D:0},
			HP:          {L: 0, H:1, D:0},
			HPSlide:     {L:-1, H:1, D:0}
			/* beautify preserve:end */
		},
		stage: stage.SampleMod + 0,
		setup: function($, P) {
			$.FilterEnabled = (P.HP > EPSILON) || (P.LP < 1 - EPSILON);

			$.LPEnabled = P.LP < 1 - EPSILON;
			$.LP = pow(P.LP, 3.0) / 10;
			$.LPSlide = 1.0 + P.LPSlide * 100 / $.SampleRate;
			$.LPPos = 0;
			$.LPPosSlide = 0;

			$.LPDamping = 5.0 / (1.0 + pow(P.LPResonance, 2) * 20) * (0.01 + P.LP);
			$.LPDamping = 1.0 - Math.min($.LPDamping, 0.8);

			$.HP = pow(P.HP, 2.0) / 10;
			$.HPPos = 0;
			$.HPSlide = 1.0 + P.HPSlide * 100 / $.SampleRate;
		},
		enabled: function($) {
			return $.FilterEnabled;
		},
		process: function($, block) {
			if (!this.enabled($)) {
				return block.length;
			}

			var lp = +$.LP;
			var lpPos = +$.LPPos;
			var lpPosSlide = +$.LPPosSlide;
			var lpSlide = +$.LPSlide;
			var lpDamping = +$.LPDamping;
			var lpEnabled = +$.LPEnabled;

			var hp = +$.HP;
			var hpPos = +$.HPPos;
			var hpSlide = +$.HPSlide;

			for (var i = 0; i < block.length; i++) {
				if ((hp > EPSILON) || (hp < -EPSILON)) {
					hp *= hpSlide;
					hp = hp < EPSILON ? EPSILON : hp > 0.1 ? 0.1 : hp;
				}

				var lpPos_ = lpPos;

				lp *= lpSlide;
				lp = lp < 0 ? lp = 0 : lp > 0.1 ? 0.1 : lp;

				var sample = block[i];
				if (lpEnabled) {
					lpPosSlide += (sample - lpPos) * lp;
					lpPosSlide *= lpDamping;
				} else {
					lpPos = sample;
					lpPosSlide = 0;
				}
				lpPos += lpPosSlide;

				hpPos += lpPos - lpPos_;
				hpPos *= 1.0 - hp;

				block[i] = hpPos;
			}

			$.LPPos = lpPos;
			$.LPPosSlide = lpPosSlide;
			$.LP = lp;
			$.HP = hp;
			$.HPPos = hpPos;

			return block.length;
		}
	};

	// Phaser Effect
	var PhaserBufferSize = 1 << 10;
	jsfx.Module.Phaser = {
		name: 'Phaser',
		params: {
			/* beautify preserve:start */
			Offset: {L:-1, H:1, D:0},
			Sweep:  {L:-1, H:1, D:0}
			/* beautify preserve:end */
		},
		stage: stage.SampleMod + 1,
		setup: function($, P) {
			$.phaserBuffer = createFloatArray(PhaserBufferSize);
			$.phaserPos = 0;
			$.phaserOffset = pow(P.Offset, 2.0) * (PhaserBufferSize - 4);
			$.phaserOffsetSlide = pow(P.Sweep, 3.0) * 4000 / $.SampleRate;
		},
		enabled: function($) {
			return (abs($.phaserOffsetSlide) > EPSILON) ||
				(abs($.phaserOffset) > EPSILON);
		},
		process: function($, block) {
			if (!this.enabled($)) {
				return block.length;
			}

			var BS = PhaserBufferSize,
				BM = BS - 1;

			var buffer = $.phaserBuffer,
				pos = $.phaserPos | 0,
				offset = +$.phaserOffset,
				offsetSlide = +$.phaserOffsetSlide;

			for (var i = 0; i < block.length; i++) {
				offset += offsetSlide;
				//TODO: check whether this is correct
				if (offset < 0) {
					offset = -offset;
					offsetSlide = -offsetSlide;
				}
				if (offset > BM) {
					offset = BM;
					offsetSlide = 0;
				}

				buffer[pos] = block[i];
				var p = (pos - (offset | 0) + BS) & BM;
				block[i] += buffer[p];

				pos = ((pos + 1) & BM) | 0;
			}

			$.phaserPos = pos;
			$.phaserOffset = offset;
			return block.length;
		}
	};

	// Volume dynamic control with Attack-Sustain-Decay
	//   ATTACK  | 0              - Volume + Punch
	//   SUSTAIN | Volume + Punch - Volume
	//   DECAY   | Volume         - 0
	jsfx.Module.Volume = {
		name: 'Volume',
		params: {
			/* beautify preserve:start */
			Master:  { L: 0, H: 1, D: 0.5 },
			Attack:  { L: 0.001, H: 1, D: 0.01 },
			Sustain: { L: 0, H: 2, D: 0.3 },
			Punch:   { L: 0, H: 3, D: 1.0 },
			Decay:   { L: 0.001, H: 2, D: 1.0 }
			/* beautify preserve:end */
		},
		stage: stage.Volume,
		setup: function($, P) {
			var SR = $.SampleRate;
			var V = P.Master;
			var VP = V * (1 + P.Punch);
			$.envelopes = [
				// S = start volume, E = end volume, N = duration in samples
				{
					S: 0,
					E: V,
					N: (P.Attack * SR) | 0
				}, // Attack
				{
					S: VP,
					E: V,
					N: (P.Sustain * SR) | 0
				}, // Sustain
				{
					S: V,
					E: 0,
					N: (P.Decay * SR) | 0
				} // Decay
			];
			// G = volume gradient
			for (var i = 0; i < $.envelopes.length; i += 1) {
				var e = $.envelopes[i];
				e.G = (e.E - e.S) / e.N;
			}
		},
		process: function($, block) {
			var i = 0;
			while (($.envelopes.length > 0) && (i < block.length)) {
				var E = $.envelopes[0];
				var vol = E.S,
					grad = E.G;

				var N = Math.min(block.length - i, E.N) | 0;
				var end = (i + N) | 0;
				for (; i < end; i += 1) {
					block[i] *= vol;
					vol += grad;
					vol = clamp(vol, 0, 10);
				}
				E.S = vol;
				E.N -= N;
				if (E.N <= 0) {
					$.envelopes.shift();
				}
			}
			return i;
		}
	};

	// PRESETS

	jsfx.DefaultModules = [
		jsfx.Module.Frequency,
		jsfx.Module.Vibrato,
		jsfx.Module.Generator,
		jsfx.Module.Filter,
		jsfx.Module.Phaser,
		jsfx.Module.Volume
	];
	jsfx.DefaultModules.sort(byStage);

	jsfx.EmptyParams = EmptyParams;

	function EmptyParams() {
		return map_object(jsfx.Module, function() {
			return {}
		});
	}

	jsfx._RemoveEmptyParams = RemoveEmptyParams;

	function RemoveEmptyParams(params) {
		for (var name in params) {
			if (Object_keys(params[name]).length == 0) {
				delete params[name];
			}
		}
	};

	jsfx.Preset = {
		Reset: function() {
			return EmptyParams();
		},
		Coin: function() {
			var p = EmptyParams();
			p.Frequency.Start = runif(880, 660);
			p.Volume.Sustain = runif(0.1);
			p.Volume.Decay = runif(0.4, 0.1);
			p.Volume.Punch = runif(0.3, 0.3);
			if (runif() < 0.5) {
				p.Frequency.ChangeSpeed = runif(0.15, 0.1);
				p.Frequency.ChangeAmount = runif(8, 4);
			}
			RemoveEmptyParams(p);
			return p;
		},
		Laser: function() {
			var p = EmptyParams();
			p.Generator.Func = rchoose(['square', 'saw', 'sine']);

			if (runif() < 0.33) {
				p.Frequency.Start = runif(880, 440);
				p.Frequency.Min = runif(0.1);
				p.Frequency.Slide = runif(0.3, -0.8);
			} else {
				p.Frequency.Start = runif(1200, 440);
				p.Frequency.Min = p.Frequency.Start - runif(880, 440);
				if (p.Frequency.Min < 110) {
					p.Frequency.Min = 110;
				}
				p.Frequency.Slide = runif(0.3, -1);
			}

			if (runif() < 0.5) {
				p.Generator.A = runif(0.5);
				p.Generator.ASlide = runif(0.2);
			} else {
				p.Generator.A = runif(0.5, 0.4);
				p.Generator.ASlide = runif(0.7);
			}

			p.Volume.Sustain = runif(0.2, 0.1);
			p.Volume.Decay = runif(0.4);
			if (runif() < 0.5) {
				p.Volume.Punch = runif(0.3);
			}
			if (runif() < 0.33) {
				p.Phaser.Offset = runif(0.2);
				p.Phaser.Sweep = runif(0.2);
			}
			if (runif() < 0.5) {
				p.Filter.HP = runif(0.3);
			}
			RemoveEmptyParams(p);
			return p;
		},
		Explosion: function() {
			var p = EmptyParams();
			p.Generator.Func = 'noise';
			if (runif() < 0.5) {
				p.Frequency.Start = runif(440, 40);
				p.Frequency.Slide = runif(0.4, -0.1);
			} else {
				p.Frequency.Start = runif(1600, 220);
				p.Frequency.Slide = runif(-0.2, -0.2);
			}

			if (runif() < 0.2) {
				p.Frequency.Slide = 0;
			}
			if (runif() < 0.3) {
				p.Frequency.RepeatSpeed = runif(0.5, 0.3);
			}

			p.Volume.Sustain = runif(0.3, 0.1);
			p.Volume.Decay = runif(0.5);
			p.Volume.Punch = runif(0.6, 0.2);

			if (runif() < 0.5) {
				p.Phaser.Offset = runif(0.9, -0.3);
				p.Phaser.Sweep = runif(-0.3);
			}

			if (runif() < 0.33) {
				p.Frequency.ChangeSpeed = runif(0.3, 0.6);
				p.Frequency.ChangeAmount = runif(24, -12);
			}
			RemoveEmptyParams(p);
			return p;
		},
		Powerup: function() {
			var p = EmptyParams();
			if (runif() < 0.5) {
				p.Generator.Func = 'saw';
			} else {
				p.Generator.A = runif(0.6);
			}

			p.Frequency.Start = runif(220, 440);
			if (runif() < 0.5) {
				p.Frequency.Slide = runif(0.5, 0.2);
				p.Frequency.RepeatSpeed = runif(0.4, 0.4);
			} else {
				p.Frequency.Slide = runif(0.2, 0.05);
				if (runif() < 0.5) {
					p.Vibrato.Depth = runif(0.6, 0.1);
					p.Vibrato.Frequency = runif(30, 10);
				}
			}

			p.Volume.Sustain = runif(0.4);
			p.Volume.Decay = runif(0.4, 0.1);

			RemoveEmptyParams(p);
			return p;
		},
		Hit: function() {
			var p = EmptyParams();
			p.Generator.Func = rchoose(['square', 'saw', 'noise']);
			p.Generator.A = runif(0.6);
			p.Generator.ASlide = runif(1, -0.5);

			p.Frequency.Start = runif(880, 220);
			p.Frequency.Slide = -runif(0.4, 0.3);

			p.Volume.Sustain = runif(0.1);
			p.Volume.Decay = runif(0.2, 0.1);

			if (runif() < 0.5) {
				p.Filter.HP = runif(0.3);
			}

			RemoveEmptyParams(p);
			return p;
		},
		Jump: function() {
			var p = EmptyParams();
			p.Generator.Func = 'square';
			p.Generator.A = runif(0.6);

			p.Frequency.Start = runif(330, 330);
			p.Frequency.Slide = runif(0.4, 0.2);

			p.Volume.Sustain = runif(0.3, 0.1);
			p.Volume.Decay = runif(0.2, 0.1);

			if (runif() < 0.5) {
				p.Filter.HP = runif(0.3);
			}
			if (runif() < 0.3) {
				p.Filter.LP = runif(-0.6, 1);
			}

			RemoveEmptyParams(p);
			return p;
		},
		Select: function() {
			var p = EmptyParams();
			p.Generator.Func = rchoose(['square', 'saw']);
			p.Generator.A = runif(0.6);

			p.Frequency.Start = runif(660, 220);

			p.Volume.Sustain = runif(0.1, 0.1);
			p.Volume.Decay = runif(0.2);

			p.Filter.HP = 0.2;
			RemoveEmptyParams(p);
			return p;
		},
		Lucky: function() {
			var p = EmptyParams();
			map_object(p, function(out, moduleName) {
				var defs = jsfx.Module[moduleName].params;
				map_object(defs, function(def, name) {
					if (def.C) {
						var values = Object_keys(def.C);
						out[name] = values[(values.length * Math.random()) | 0];
					} else {
						out[name] = Math.random() * (def.H - def.L) + def.L;
					}
				});
			});
			p.Volume.Master = 0.4;
			p.Filter = {}; // disable filter, as it usually will clip everything
			RemoveEmptyParams(p);
			return p;
		}
	};

	// GENERATORS

	// uniform noise
	jsfx.G.unoise = newGenerator("sample = Math.random();");
	// sine wave
	jsfx.G.sine = newGenerator("sample = Math.sin(phase);");
	// saw wave
	jsfx.G.saw = newGenerator("sample = 2*(phase/TAU - ((phase/TAU + 0.5)|0));");
	// triangle wave
	jsfx.G.triangle = newGenerator("sample = Math.abs(4 * ((phase/TAU - 0.25)%1) - 2) - 1;");
	// square wave
	jsfx.G.square = newGenerator("var s = Math.sin(phase); sample = s > A ? 1.0 : s < A ? -1.0 : A;");
	// simple synth
	jsfx.G.synth = newGenerator("sample = Math.sin(phase) + .5*Math.sin(phase/2) + .3*Math.sin(phase/4);");

	// STATEFUL
	var __noiseLast = 0;
	jsfx.G.noise = newGenerator("if(phase % TAU < 4){__noiseLast = Math.random() * 2 - 1;} sample = __noiseLast;");

	// Karplus-Strong string
	jsfx.G.string = {
		create: function() {
			var BS = 1 << 16;
			var BM = BS - 1;

			var buffer = createFloatArray(BS);
			for (var i = 0; i < buffer.length; i++) {
				buffer[i] = Math.random() * 2 - 1;
			}

			var head = 0;
			return function($, block) {
				var TAU = Math.PI * 2;
				var A = +$.generatorA,
					ASlide = +$.generatorASlide,
					B = +$.generatorB,
					BSlide = +$.generatorBSlide;
				var buf = buffer;

				for (var i = 0; i < block.length; i++) {
					var phaseSpeed = block[i];
					var n = (TAU / phaseSpeed) | 0;
					A += ASlide;
					B += BSlide;
					A = A < 0 ? 0 : A > 1 ? 1 : A;
					B = B < 0 ? 0 : B > 1 ? 1 : B;

					var t = ((head - n) + BS) & BM;
					var sample = (
						buf[(t - 0 + BS) & BM] * 1 +
						buf[(t - 1 + BS) & BM] * A +
						buf[(t - 2 + BS) & BM] * B) / (1 + A + B);

					buf[head] = sample;
					block[i] = buf[head];
					head = (head + 1) & BM;
				}

				$.generatorA = A;
				$.generatorB = B;
				return block.length;
			}
		}
	};

	// Generates samples using given frequency and generator
	function newGenerator(line) {
		return new Function("$", "block", "" +
			"var TAU = Math.PI * 2;\n" +
			"var sample;\n" +
			"var phase = +$.generatorPhase,\n" +
			"	A = +$.generatorA, ASlide = +$.generatorASlide,\n" +
			"	B = +$.generatorB, BSlide = +$.generatorBSlide;\n" +
			"\n" +
			"for(var i = 0; i < block.length; i++){\n" +
			"	var phaseSpeed = block[i];\n" +
			"	phase += phaseSpeed;\n" +
			"	if(phase > TAU){ phase -= TAU };\n" +
			"	A += ASlide; B += BSlide;\n" +
			"   A = A < 0 ? 0 : A > 1 ? 1 : A;\n" +
			"   B = B < 0 ? 0 : B > 1 ? 1 : B;\n" +
			line +
			"	block[i] = sample;\n" +
			"}\n" +
			"\n" +
			"$.generatorPhase = phase;\n" +
			"$.generatorA = A;\n" +
			"$.generatorB = B;\n" +
			"return block.length;\n" +
			"");
	}

	// WAVE SUPPORT

	// Creates an Wave byte array from audio data [-1.0 .. 1.0]
	jsfx.CreateWave = CreateWave;

	function CreateWave(data) {
		if (typeof Float32Array !== "undefined") {
			assert(data instanceof Float32Array, 'data must be an Float32Array');
		}

		var blockAlign = numChannels * bitsPerSample >> 3;
		var byteRate = jsfx.SampleRate * blockAlign;

		var output = createByteArray(8 + 36 + data.length * 2);
		var p = 0;

		// emits string to output
		function S(value) {
			for (var i = 0; i < value.length; i += 1) {
				output[p] = value.charCodeAt(i);
				p++;
			}
		}

		// emits integer value to output
		function V(value, nBytes) {
			if (nBytes <= 0) {
				return;
			}
			output[p] = value & 0xFF;
			p++;
			V(value >> 8, nBytes - 1);
		}
		/* beautify preserve:start */
		S('RIFF'); V(36 + data.length * 2, 4);

		S('WAVEfmt '); V(16, 4); V(1, 2);
		V(numChannels, 2); V(jsfx.SampleRate, 4);
		V(byteRate, 4); V(blockAlign, 2); V(bitsPerSample, 2);

		S('data'); V(data.length * 2, 4);
		CopyFToU8(output.subarray(p), data);
		/* beautify preserve:end */

		return output;
	};

	// Creates an Audio element from audio data [-1.0 .. 1.0]
	jsfx.CreateAudio = CreateAudio;

	function CreateAudio(data) {
		var wave = CreateWave(data);
		return new Audio('data:audio/wav;base64,' + U8ToB64(wave));
	};

	jsfx.DownloadAsFile = function(audio) {
		assert(audio instanceof Audio, 'input must be an Audio object');
		document.location.href = audio.src;
	};

	// HELPERS
	jsfx.Util = {};

	// Copies array of Floats to a Uint8Array with 16bits per sample
	jsfx.Util.CopyFToU8 = CopyFToU8;

	function CopyFToU8(into, floats) {
		assert(into.length / 2 == floats.length,
			'the target buffer must be twice as large as the iinput');

		var k = 0;
		for (var i = 0; i < floats.length; i++) {
			var v = +floats[i];
			var a = (v * 0x7FFF) | 0;
			a = a < -0x8000 ? -0x8000 : 0x7FFF < a ? 0x7FFF : a;
			a += a < 0 ? 0x10000 : 0;
			into[k] = a & 0xFF;
			k++;
			into[k] = a >> 8;
			k++;
		}
	}

	// Encodes Uint8Array with base64
	jsfx.Util.U8ToB64 = U8ToB64;

	function U8ToB64(data) {
		var CHUNK = 0x8000;
		var result = '';
		for (var start = 0; start < data.length; start += CHUNK) {
			var end = Math.min(start + CHUNK, data.length);
			result += String.fromCharCode.apply(null, data.subarray(start, end));
		}
		return btoa(result);
	}

	// uses AudioContext sampleRate or 44100;
	function getDefaultSampleRate() {
		if (typeof AudioContext !== 'undefined') {
			return (new AudioContext()).sampleRate;
		}
		return 44100;
	}

	// for checking pre/post conditions
	function assert(condition, message) {
		if (!condition) {
			throw new Error(message);
		}
	}

	function clamp(v, min, max) {
		v = +v;
		min = +min;
		max = +max;
		if (v < min) {
			return +min;
		}
		if (v > max) {
			return +max;
		}
		return +v;
	}

	function clamp1(v) {
		v = +v;
		if (v < +0.0) {
			return +0.0;
		}
		if (v > +1.0) {
			return +1.0;
		}
		return +v;
	}

	function map_object(obj, fn) {
		var r = {};
		for (var name in obj) {
			if (obj.hasOwnProperty(name)) {
				r[name] = fn(obj[name], name);
			}
		}
		return r;
	}

	// uniform random
	function runif(scale, offset) {
		var a = Math.random();
		if (scale !== undefined)
			a *= scale;
		if (offset !== undefined)
			a += offset;
		return a;
	}

	function rchoose(gens) {
		return gens[(gens.length * Math.random()) | 0];
	}

	function Object_keys(obj) {
		var r = [];
		for (var name in obj) {
			r.push(name);
		}
		return r;
	}

	jsfx._createFloatArray = createFloatArray;

	function createFloatArray(N) {
		if (typeof Float32Array === "undefined") {
			var r = new Array(N);
			for (var i = 0; i < r.length; i++) {
				r[i] = 0.0;
			}
		}
		return new Float32Array(N);
	}

	function createByteArray(N) {
		if (typeof Uint8Array === "undefined") {
			var r = new Array(N);
			for (var i = 0; i < r.length; i++) {
				r[i] = 0 | 0;
			}
		}
		return new Uint8Array(N);
	}

	return jsfx;
}));



const noises =
	{
		"1": {
			"Frequency": {
				"Start": 199.27033375477032,
				"Slide": 0.21237188837511609
			},
			"Generator": {
				"Func": "noise"
			},
			"Phaser": {
				"Offset": 0.04301412486602352,
				"Sweep": -0.14319710898396903
			},
			"Volume": {
				"Sustain": 0.1463195500577345,
				"Decay": 0.06077918145417238,
				"Punch": 0.6420285625662108
			}
		},
		"2": {
			"Frequency": {
				"Start": 95.74101628800832,
				"Slide": 0
			},
			"Generator": {
				"Func": "noise"
			},
			"Phaser": {
				"Offset": 0.10076366999692693,
				"Sweep": -0.17794971603923573
			},
			"Volume": {
				"Sustain": 0.1451085985840173,
				"Decay": 0.32583242326086104,
				"Punch": 0.37692421278909904
			}
		},
		"3": {
			"Frequency": {
				"Start": 1062.5376767410562,
				"Slide": -0.5218768693306886
			},
			"Generator": {
				"Func": "square",
				"A": 0.045183659107490025,
				"ASlide": -0.3918165937010962
			},
			"Volume": {
				"Sustain": 0.06385365773477472,
				"Decay": 0.27509507581230774
			}
		},
		"4": {
			"Frequency": {
				"Start": 840.5011081127645,
				"Min": 1266.2370355073792,
				"Max": 1085.8771625146178,
				"Slide": 0.20466251552475967,
				"DeltaSlide": -0.7808375200684368,
				"RepeatSpeed": 0.9233063342543593,
				"ChangeAmount": 9.112754825023409,
				"ChangeSpeed": 0.3474833656090921
			},
			"Vibrato": {
				"Depth": 0.7533458799280763,
				"DepthSlide": -0.8561223618600482,
				"Frequency": 37.86778576108967,
				"FrequencySlide": 0.5066501923683027
			},
			"Generator": {
				"Func": "saw",
				"A": 0.09560233003534435,
				"B": 0.5054869940613229,
				"ASlide": 0.03697750352961737,
				"BSlide": 0.7042166850023546
			},
			"Guitar": {
				"A": 0.22820962757097818,
				"B": 0.5666029839103637,
				"C": 0.45690472504779134
			},
			"Phaser": {
				"Offset": 0.5224333872634297,
				"Sweep": -0.5514501526267179
			},
			"Volume": {
				"Master": 0.4,
				"Attack": 0.2771710898431308,
				"Sustain": 1.5909793433322963,
				"Punch": 0.29401569333734856,
				"Decay": 1.32408923630018
			}
		},
		"5": {
			"Frequency": {
				"Start": 1336.757295460379,
				"ChangeSpeed": 0.10201318364914982,
				"ChangeAmount": 4.118162903285514
			},
			"Volume": {
				"Sustain": 0.04572099624390416,
				"Decay": 0.18061153823171489,
				"Punch": 0.5713897778376296
			}
		},
		"6": {
			"Frequency": {
				"Start": 556.0785746598697,
				"Slide": 0.11154675459564918
			},
			"Vibrato": {
				"Depth": 0.639720885632239,
				"Frequency": 36.498000624630826
			},
			"Generator": {
				"A": 0.14365673691415518
			},
			"Volume": {
				"Sustain": 0.07393750119984173,
				"Decay": 0.23189387706323458
			}
		},
		"7": {
			"Frequency": {
				"Start": 604.9129400842817,
				"Slide": -0.25047730157180614
			},
			"Generator": {
				"Func": "noise"
			},
			"Phaser": {
				"Offset": 0.42897957052309726,
				"Sweep": -0.1012249504840073
			},
			"Volume": {
				"Sustain": 0.319325227024538,
				"Decay": 0.07575421527363657,
				"Punch": 0.45579376256037235
			}
		},
		"8": {
			"Frequency": {
				"Start": 668.1651977412896,
				"Slide": -0.43306525285141684
			},
			"Generator": {
				"Func": "saw",
				"A": 0.5711117561657586,
				"ASlide": 0.04509194846745568
			},
			"Filter": {
				"HP": 0.031165119326274925
			},
			"Volume": {
				"Sustain": 0.07143140975736416,
				"Decay": 0.1277776651583285
			}
		},
		"9": {
			"Frequency": {
				"Start": 579.5444006624668,
				"Min": 1010.2907653700962,
				"Max": 626.78454562776,
				"Slide": 0.6522047446896324,
				"DeltaSlide": -0.9316941556700837,
				"RepeatSpeed": 0.3955410810041149,
				"ChangeAmount": 5.807002797513796,
				"ChangeSpeed": 0.6403348414519359
			},
			"Vibrato": {
				"Depth": 0.09351633039908447,
				"DepthSlide": -0.6427754723337058,
				"Frequency": 22.54789928548274,
				"FrequencySlide": -0.35236715311301925
			},
			"Generator": {
				"Func": "synth",
				"A": 0.6834491877167272,
				"B": 0.9259045224602924,
				"ASlide": 0.7891987220141599,
				"BSlide": 0.3750603310516354
			},
			"Guitar": {
				"A": 0.9857380380746257,
				"B": 0.2715225298900714,
				"C": 0.5247272581046842
			},
			"Phaser": {
				"Offset": -0.7438284536560724,
				"Sweep": 0.3196337180893112
			},
			"Volume": {
				"Master": 0.4,
				"Attack": 0.7864890839950339,
				"Sustain": 0.6823301815584255,
				"Punch": 0.40271456105324144,
				"Decay": 1.3310582587777122
			}
		},
		"10": {
			"Frequency": {
				"Start": 657.1465138691775,
				"Slide": 0.5085535187211165,
				"RepeatSpeed": 0.7202031290046107
			},
			"Generator": {
				"Func": "saw"
			},
			"Volume": {
				"Sustain": 0.26855607458038655,
				"Decay": 0.23840891483660498
			}
		},
		"11": {
			"Frequency": {
				"Start": 489.0007726874367
			},
			"Generator": {
				"Func": "saw",
				"A": 0.23045943564992444
			},
			"Filter": {
				"HP": 0.2
			},
			"Volume": {
				"Sustain": 0.10207051027011432,
				"Decay": 0.09858808760729164
			}
		},
		"12": {
			"Frequency": {
				"Start": 33.608272042025106,
				"Min": 296.8291381814496,
				"Max": 548.8026449449674,
				"Slide": -0.15303794346439537,
				"DeltaSlide": -0.08076324326251605,
				"RepeatSpeed": 0.3082948667931338,
				"ChangeAmount": -9.774838470384987,
				"ChangeSpeed": 0.6873376734827858
			},
			"Vibrato": {
				"Depth": 0.3100487243232144,
				"DepthSlide": 0.5794460415540854,
				"Frequency": 0.8678159768103203,
				"FrequencySlide": 0.04029078039058076
			},
			"Generator": {
				"Func": "triangle",
				"A": 0.04416619099210939,
				"B": 0.6297822049479846,
				"ASlide": -0.6817601153677395,
				"BSlide": 0.7198204122005616
			},
			"Guitar": {
				"A": 0.4381231344236467,
				"B": 0.38783726884453995,
				"C": 0.7368145264082102
			},
			"Phaser": {
				"Offset": 0.36727500328252694,
				"Sweep": 0.398965930702599
			},
			"Volume": {
				"Master": 0.4,
				"Attack": 0.25955723212766096,
				"Sustain": 1.6305148335894581,
				"Punch": 1.1137077507977762,
				"Decay": 1.3699553229373753
			}
		},
		"13": {
			"Frequency": {
				"Start": 504.7419064225182,
				"Slide": 0.4158971079296136,
				"RepeatSpeed": 0.670018917245786
			},
			"Generator": {
				"Func": "saw"
			},
			"Volume": {
				"Sustain": 0.12300043401140659,
				"Decay": 0.45013209586786573
			}
		},
		"14": {
			"Frequency": {
				"Start": 397.94968895171564,
				"Slide": 0.37715852256741567
			},
			"Generator": {
				"Func": "sine",
				"A": 0.15039838152990587
			},
			"Filter": {
				"HP": 0.22172565999616664
			},
			"Volume": {
				"Sustain": 0.377645797001808,
				"Decay": 0.26232515754959357
			}
		},
		"15": {
			"Frequency": {
				"Start": 1603.225571746589,
				"Min": 995.7086198583559,
				"Slide": -0.8517525117023443
			},
			"Generator": {
				"Func": "sine",
				"A": 0.03170015514980118,
				"ASlide": 0.1412486854054671
			},
			"Phaser": {
				"Offset": 0.1108573492944406,
				"Sweep": 0.1797725577061543
			},
			"Volume": {
				"Sustain": 0.1656650709619566,
				"Decay": 0.17266258342618368,
				"Punch": 0.14584719888494488
			}
		},
		"16": {
			"Frequency": {
				"Start": 1717.1695103123393,
				"Min": 546.8551014916371,
				"Max": 603.6654685493712,
				"Slide": 0.9131852782263996,
				"DeltaSlide": -0.5172847258304092,
				"RepeatSpeed": 2.6732802442396184,
				"ChangeAmount": 8.713488482076578,
				"ChangeSpeed": 0.3675163524032332
			},
			"Vibrato": {
				"Depth": 0.5648603677141393,
				"DepthSlide": 0.9271882089769354,
				"Frequency": 7.818393548943951,
				"FrequencySlide": 0.029273285842671637
			},
			"Generator": {
				"Func": "sine",
				"A": 0.40144855323555606,
				"B": 0.36481557367935347,
				"ASlide": 0.860910403478051,
				"BSlide": 0.4173834566868946
			},
			"Guitar": {
				"A": 0.6491052376466115,
				"B": 0.5700542485286049,
				"C": 0.13657774602491313
			},
			"Phaser": {
				"Offset": 0.3386367336712093,
				"Sweep": -0.16191957218084818
			},
			"Volume": {
				"Master": 0.4,
				"Attack": 0.39442692537572627,
				"Sustain": 1.2288175971584336,
				"Punch": 2.283715193468832,
				"Decay": 1.3144724079816905
			}
		},
		"17": {
			"Frequency": {
				"Start": 525.8391132664372,
				"Slide": 0.20556930483727237
			},
			"Generator": {
				"Func": "saw"
			},
			"Volume": {
				"Sustain": 0.3712103737092789,
				"Decay": 0.28743735986129826
			}
		},
		"18": {
			"Frequency": {
				"Start": 643.5523791210577,
				"Min": 169.29939184600028,
				"Slide": -0.800598009172313
			},
			"Generator": {
				"Func": "sine",
				"A": 0.856674302589898,
				"ASlide": 0.14567738646313969
			},
			"Volume": {
				"Sustain": 0.20326262334281134,
				"Decay": 0.2799922752836393,
				"Punch": 0.18228721421081323
			}
		},
		"19": {
			"Frequency": {
				"Start": 249.4989253352472
			},
			"Generator": {
				"Func": "square",
				"A": 0.5911830300044757
			},
			"Filter": {
				"HP": 0.2
			},
			"Volume": {
				"Sustain": 0.12289949268738042,
				"Decay": 0.05342175748084173
			}
		},
		"20": {
			"Frequency": {
				"Start": 249.4989253352472
			},
			"Generator": {
				"Func": "sine",
				"A": 0.5911830300044757
			},
			"Filter": {
				"HP": 0.2
			},
			"Volume": {
				"Sustain": 0.12289949268738042,
				"Decay": 0.05342175748084173
			}
		},
		"21": {
			"Frequency": {
				"Start": 249.4989253352472
			},
			"Generator": {
				"Func": "triangle",
				"A": 0.5911830300044757
			},
			"Filter": {
				"HP": 0.2
			},
			"Volume": {
				"Sustain": 0.12289949268738042,
				"Decay": 0.05342175748084173,
				"Attack": 0.301
			}
		},
		"22": {
			"Frequency": {
				"Start": 249.4989253352472
			},
			"Generator": {
				"Func": "string",
				"A": 0.5911830300044757
			},
			"Filter": {
				"HP": 0.2
			},
			"Volume": {
				"Sustain": 0.12289949268738042,
				"Decay": 0.05342175748084173,
				"Attack": 0.301
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01
			}
		},
		"23": {
			"Frequency": {
				"Start": 249.4989253352472
			},
			"Generator": {
				"Func": "synth",
				"A": 0.5911830300044757
			},
			"Filter": {
				"HP": 0.2
			},
			"Volume": {
				"Sustain": 0.12289949268738042,
				"Decay": 0.311,
				"Attack": 0.301
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01
			}
		},
		"24": {
			"Frequency": {
				"Start": 249.4989253352472,
				"RepeatSpeed": 0.47,
				"ChangeSpeed": 0.08
			},
			"Generator": {
				"Func": "sine",
				"A": 0.5911830300044757,
				"ASlide": -0.46,
				"B": 0.34
			},
			"Filter": {
				"HP": 0.35,
				"LPResonance": 0.2
			},
			"Volume": {
				"Sustain": 0.34,
				"Decay": 0.701,
				"Attack": 0.301
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01,
				"DepthSlide": -0.41,
				"FrequencySlide": 0.11
			},
			"Phaser": {
				"Sweep": 0.21
			}
		},
		"25": {
			"Frequency": {
				"Start": 249.4989253352472,
				"RepeatSpeed": 0.47,
				"ChangeSpeed": 0.08
			},
			"Generator": {
				"Func": "noise",
				"A": 0.5911830300044757,
				"ASlide": -0.46,
				"B": 0.34
			},
			"Filter": {
				"HP": 0.35,
				"LPResonance": 0.2
			},
			"Volume": {
				"Sustain": 0.34,
				"Decay": 0.701,
				"Attack": 0.301
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01,
				"DepthSlide": -0.41,
				"FrequencySlide": 0.11
			},
			"Phaser": {
				"Sweep": 0.21
			}
		},
		"26": {
			"Frequency": {
				"Start": 249.4989253352472,
				"RepeatSpeed": 0.47,
				"ChangeSpeed": 0.08,
				"Min": 129
			},
			"Generator": {
				"Func": "noise",
				"A": 0.5911830300044757,
				"ASlide": -0.46,
				"B": 0.34
			},
			"Filter": {
				"HP": 0.35,
				"LPResonance": 0.2
			},
			"Volume": {
				"Sustain": 0.34,
				"Decay": 0.701,
				"Attack": 0.301
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01,
				"DepthSlide": -0.41,
				"FrequencySlide": 0.11
			},
			"Phaser": {
				"Sweep": 0.21
			}
		},
		"27": {
			"Frequency": {
				"Start": 249.4989253352472,
				"RepeatSpeed": 0.47,
				"ChangeSpeed": 0.08,
				"Min": 129
			},
			"Generator": {
				"Func": "saw",
				"A": 0.5911830300044757,
				"ASlide": -0.46,
				"B": 0.34
			},
			"Filter": {
				"HP": 0.35,
				"LPResonance": 0.2
			},
			"Volume": {
				"Sustain": 0.34,
				"Decay": 0.701,
				"Attack": 0.301
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01,
				"DepthSlide": -0.41,
				"FrequencySlide": 0.11
			},
			"Phaser": {
				"Sweep": 0.21
			}
		},
		"28": {
			"Frequency": {
				"Start": 249.4989253352472,
				"RepeatSpeed": 0.47,
				"ChangeSpeed": 0.08,
				"Min": 129
			},
			"Generator": {
				"Func": "square",
				"A": 0.5911830300044757,
				"ASlide": -0.46,
				"B": 0.47
			},
			"Filter": {
				"HP": 0.35,
				"LPResonance": 0.2
			},
			"Volume": {
				"Sustain": 0.34,
				"Decay": 0.701,
				"Attack": 0.301
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01,
				"DepthSlide": -0.41,
				"FrequencySlide": 0.11
			},
			"Phaser": {
				"Sweep": 0.21
			}
		},
		"29": {
			"Frequency": {
				"Start": 249.4989253352472,
				"RepeatSpeed": 0.47,
				"ChangeSpeed": 0.08,
				"Min": 129
			},
			"Generator": {
				"Func": "string",
				"A": 0.5911830300044757,
				"ASlide": -0.46,
				"B": 0.47
			},
			"Filter": {
				"HP": 0.35,
				"LPResonance": 0.2
			},
			"Volume": {
				"Sustain": 0.34,
				"Decay": 0.701,
				"Attack": 0.301,
				"Master": 0.56
			},
			"Vibrato": {
				"Depth": 0.09,
				"Frequency": 18.01,
				"DepthSlide": -0.01,
				"FrequencySlide": 0.11
			},
			"Phaser": {
				"Sweep": 0.21
			}
		},
		"30": {
			"Frequency": {
				"Start": 615.6494702803311
			},
			"Generator": {
				"Func": "square",
				"A": 0.40135790842066854
			},
			"Filter": {
				"HP": 0.2
			},
			"Volume": {
				"Sustain": 0.1695272479652697,
				"Decay": 0.1705148518007693
			}
		},
		"31": {
			"Frequency": {
				"Start": 615.6494702803311,
				"ChangeSpeed": 0.1
			},
			"Generator": {
				"Func": "noise",
				"A": 0.40135790842066854
			},
			"Filter": {
				"HP": 0.2,
				"LPResonance": 0.38
			},
			"Volume": {
				"Sustain": 0.36,
				"Decay": 0.1705148518007693,
				"Attack": 0.201
			},
			"Vibrato": {
				"DepthSlide": -0.35,
				"Depth": 0.11
			}
		},
		"32": {
			"Frequency": {
				"Start": 332.1845523650188,
				"Slide": -0.38458865159124017
			},
			"Generator": {
				"Func": "saw",
				"A": 0.24214179258300614,
				"ASlide": -0.18093306518511332
			},
			"Filter": {
				"HP": 0.25478001983284077
			},
			"Volume": {
				"Sustain": 0.08622878550108837,
				"Decay": 0.20262495040717662
			}
		},
		"33": {
			"Frequency": {
				"Start": 332.1845523650188,
				"Slide": -0.38458865159124017
			},
			"Generator": {
				"Func": "triangle",
				"A": 0.24214179258300614,
				"ASlide": -0.18093306518511332,
				"BSlide": -0.54
			},
			"Filter": {
				"HP": 0.25478001983284077,
				"LPResonance": 0.25
			},
			"Volume": {
				"Sustain": 0.08622878550108837,
				"Decay": 0.20262495040717662,
				"Attack": 0.251
			},
			"Vibrato": {
				"Frequency": 5.01
			}
		},
		"34": {
			"Frequency": {
				"Start": 349.42863263977546,
				"Slide": 0.1399855109868625
			},
			"Generator": {
				"Func": "noise",
				"A": 0.3,
				"ASlide": -0.37
			},
			"Phaser": {
				"Offset": 0.13452160435601618,
				"Sweep": -0.15454704594608001
			},
			"Volume": {
				"Sustain": 0.51,
				"Decay": 0.3918556934123816,
				"Punch": 0.3003951975054825
			}
		},
		"35": {
			"Frequency": {
				"Start": 591.6187400862045,
				"Slide": 0.5478892085898146
			},
			"Generator": {
				"Func": "square",
				"A": 0.22496234156008743
			},
			"Filter": {
				"HP": 0.17729220912779542,
				"LP": 0.8819085294772236
			},
			"Volume": {
				"Sustain": 0.38481754907100785,
				"Decay": 0.11299838955771593
			}
		},
		"36": {
			"Frequency": {
				"Start": 979.8695250696014,
				"ChangeSpeed": 0.10791661129583746,
				"ChangeAmount": 6.992337674934127,
				"RepeatSpeed": 0.41,
				"Min": 290
			},
			"Volume": {
				"Sustain": 0.03861322651963828,
				"Decay": 0.24750886723938362,
				"Punch": 0.34226028037374623
			},
			"Generator": {
				"B": 0.24
			},
			"Filter": {
				"LPResonance": 0.23,
				"HP": 0.17
			},
			"Phaser": {
				"Offset": -0.43
			},
			"Vibrato": {
				"Depth": 0.3,
				"DepthSlide": 0.1
			}
		}
};
	const sfx = jsfx.Sounds(noises);
