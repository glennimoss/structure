'use strict'
const RESOURCES = ["exp","stars","stardust","gold","science","mana","fears","clouds","thunderstone","_0","_1","_2","_3","_4","_5","_6"]
const GAME_ADVANCE_ITERATIONS = 10000
const GAME_ADVANCE_ITERATIONS_MAX = 100000
const GAME_ADVANCE_ITERATIONS_STEP = 200
const GAME_ADVANCE_ITERATIONS_STEP_TIME = 500
const GAME_AUTOMATION_PERIOD = 1000

const BASE_AVAILABLE = {
	buildings : [[],[],[],[],[]],
	spells : [],
}

//l = 1,m = Array(51).fill().map((x,n) => GameMap(mapLevel(n), mapMaker)).map(m => m.points.map(x => x.power * x.length).filter(x => x)).map (x => (k=(Math.min(...x)/l),l=Math.max(...x),k)).slice(1), [Math.max(...m), Math.min(...m)]
const game = {
	updateMapBackground : false,
	updateWorldBackground : false,
	skillCostMult : 1,
	sliders : [],
	pulses : [],
	sliderPresets : {},
	animatingPoints : new Set(),
	frame : 0,
	growth : POINT_TYPES.reduce((v, x, n) => (n ? v[x] = 0 : v, v), {}),
	multi : POINT_TYPES.reduce((v, x, n) => (n ? v[x] = 1 : v, v), {}),
	skills : Object.keys(SKILLS).reduce((v,x) => (v[x] = 0,v),{}),
	canStarfield : true,
	resources : {},
	letters : {},
	automation : {
		types : [],
		maxLevel : 0,
		maxCost : 100,
		buildings: {}
	},
	production : {},
	research : {},
	available : Object.assign({}, BASE_AVAILABLE),
	attacked : new Set(),
	harvesting : new Set(),
	stardust : {},
	statistics : {
		onlineTime : 1
	},
	renderData: {},
	story : {},
	lastViewedStory : 0,
	lastSave : performance.now(),
	lastCloudSave : performance.now(),
	
	updateRenderData() {	
		if (!gui.mainViewport.width || !gui.mainViewport.height) return
		if (!this.renderData.radarCV) {
			this.renderData.radarCV = document.createElement("canvas")
		}
		if (game.map.markers && game.map.markers.length) {
			this.renderData.radarCV.width  = gui.mainViewport.width / gui.mainViewport.min.zoom | 0
			this.renderData.radarCV.height = gui.mainViewport.height / gui.mainViewport.min.zoom | 0
			const c = this.renderData.radarCV.getContext("2d")
			const grad = gui.foregroundContext.createRadialGradient(0, 0, 0, 0, 0, 5)
			grad.addColorStop(0, gui.theme.radar)
			grad.addColorStop(1, "transparent")
			c.translate(gui.mainViewport.halfWidth / gui.mainViewport.min.zoom, gui.mainViewport.halfHeight / gui.mainViewport.min.zoom)
			c.fillStyle = grad
			this.map.points.filter(pt => pt.owned).map(pt => {
				c.save()
				c.beginPath()
				c.translate(pt.x, pt.y)
				c.scale(pt.size, pt.size)
				c.moveTo(5, pt.y)
				c.arc(0, 0, 5, 0, 6.29)
				c.fill()
				c.restore()
			})
			this.renderData.radar = gui.foregroundContext.createPattern(this.renderData.radarCV, "repeat")
		}
	},
	
	render() {
		this.frame++
		
		gui.dvOffline.classList.toggle("hidden", !this.offline)
		
		if (this.offline) {
/*			const time = timeString(this.timeLeft * 1000, 1).split(" ")
			let timeStr = time.slice(0,4).join(" ")
			if (time.length > 4)
				timeStr += "\n"+time.slice(4).join(" ")*/
			gui.dvOfflineCountdown.innerText = shortTimeString(this.timeLeft, 0, 2, false)
		} else {
			if (gui.tabs.activeTab == "map") {
				if (this.slowMode) {
					if (this.updateInterface) 
						gui.map.updateLowLoad()
				} else {
					if (this.updateMapBackground) {
						this.renderBackground(gui.backgroundContext)
						this.updateMapBackground = false
					}
					this.renderForeground(gui.foregroundContext)
					
					if (this.updateInterface) {
//						gui.map.dvResources.innerText = Object.entries(game.resources).reduce((v,x) => x[0][0]=="_"?v:x[1]?v+"\n"+x[0].capitalizeFirst() + ": " + displayNumber(x[1]) + (game.real.production[x[0]]?" ("+(game.real.production[x[0]]>0?(x[0] == "science" && game.researching?"Researching ":"+"):"")+displayNumber(game.real.production[x[0]])+"/s)":""):v,"").trim()
						gui.map.updateGrowth()
						gui.map.updateHarvest()
						gui.map.updateResources()
					}
				}
			}

			if (this.updateInterface && gui.tabs.activeTab == "sliders" || gui.tabs.activeTab == "skills" || gui.tabs.activeTab == "management" || gui.tabs.activeTab == "stardust" || gui.tabs.activeTab == "artifacts")
				gui.map.updateResources()
			
			if (gui.tabs.activeTab == "stardust") {
				gui.map.updateGrowth()
			}
		
			if (gui.tabs.activeTab == "world") {
				if (this.updateWorldBackground)
					this.world.renderBackground(gui.world.backgroundContext)
				this.updateWorldBackground = false
				this.world.render(gui.world.foregroundContext)
				if (this.updateInterface) {
					gui.map.updateHarvest()
				}
			}
	
			if (this.updateInterface) {
				gui.update()
				if (this.updateStardust)
					gui.stardust.updateStardust()
			}
	
			if (!(this.frame % 60)) {
				gui.skills.updateExp()
				gui.artifacts.updateTitle()
			}		
	
			this.updateInterface = false
		}
	},
	
	renderBackground(c) {
		c.clearRect(0, 0, gui.mainViewport.width, gui.mainViewport.height)
		c.save()
		c.translate(gui.mainViewport.halfWidth, gui.mainViewport.halfHeight)
		c.scale(gui.mainViewport.current.zoom, gui.mainViewport.current.zoom)
		c.translate(-gui.mainViewport.current.x, -gui.mainViewport.current.y)
		if (this.skills.magic)
			this.renderCircle(c, this.map.ownedRadius)
		//this.renderCircle(c, this.map.size)
		this.map.renderMap(c)
		c.restore()
	},	
	
	renderForeground(c) {
		function drawPing(col, x, y, size) {
			c.save()
			c.translate(x,y)
			if (size)
				c.scale(size/5, size/5)
			else
			c.scale(1/gui.mainViewport.current.zoom, 1/gui.mainViewport.current.zoom)
			const radius = 10 - game.frame % 20 / 2
			c.strokeStyle = col
			for (let i = 0; i < 3; i++) {
				c.globalAlpha = Math.min(1, 2 - 0.66 * i - radius / 15)
				c.beginPath()
				c.lineWidth = (40 - radius - i*10) / 10
				c.moveTo(radius + i * 10, 0)
				c.arc(0, 0, radius + i * 10, 0, 6.29)
				c.stroke()
			}
			c.restore()
		}

		c.clearRect(0, 0, gui.mainViewport.width, gui.mainViewport.height)
		c.save()
		c.lineWidth = Math.max(1, 1.5/gui.mainViewport.current.zoom)
		c.translate(gui.mainViewport.halfWidth, gui.mainViewport.halfHeight)
		c.scale(gui.mainViewport.current.zoom, gui.mainViewport.current.zoom)
		c.translate(-gui.mainViewport.current.x, -gui.mainViewport.current.y)
		c.lineCap = "round"
		this.renderAnimations(c)
		this.sliders.map(x => x.render(c))
		this.pulses.map(x => x.render(c))
		if (gui.mapMouse.closest) {
			c.save()
			c.lineWidth = Math.max(1, 1/gui.mainViewport.current.zoom)
			c.translate(gui.mapMouse.closest.x, gui.mapMouse.closest.y)
			c.strokeStyle = gui.mapMouse.closest.owned?gui.theme.mouseOwned:(gui.mapMouse.closest.lock && !gui.mapMouse.closest.keyData.keyPoint.owned)?gui.theme.shades[11]:gui.theme.mouseEnemy
			c.beginPath()
			let radius = gui.mapMouse.closest.size + (gui.mapMouse.closest.level || 0) * 2 + 1.75 + 0.5 * Math.sin(this.frame / 30) 
			let angle = this.frame / 50
			c.arc(0, 0, radius, angle, angle + 0.5)
			c.stroke()
			c.beginPath()
			c.arc(0, 0, radius, angle + Math.PI / 3 * 2, angle + 0.5 + Math.PI / 3 * 2)
			c.stroke()
			c.beginPath()
			c.arc(0, 0, radius, angle + Math.PI / 3 * 4, angle + 0.5 + Math.PI / 3 * 4)
			c.stroke()
			c.restore()
						
			let partner
			
			if (gui.mapMouse.closest.lock) 
				partner = gui.mapMouse.closest.keyData.keyPoint
			if (gui.mapMouse.closest.key) 
				partner = gui.mapMouse.closest.keyData.lockPoint
			
			if (partner && partner.away < 2 && partner.locked < 2) {
				drawPing(partner.owned?gui.theme.mouseOwned:gui.theme.mouseEnemy, partner.x, partner.y, partner.size)
			}

			function drawRegion(point) {
				if (!point.owned) return
				//if (point.locked == 1) return
				c.save()
				c.translate(point.x, point.y)
				const voronoi = point.getVoronoi()
				voronoi.edges.map(edge => {
					c.moveTo(edge.start.x, edge.start.y)
					c.lineTo(edge.end.x, edge.end.y)
/*					c.lineTo(edge.end.x  * 0.8, edge.end.y * 0.8)
					c.lineTo(edge.start.x  * 0.8, edge.start.y * 0.8)
					c.lineTo(edge.start.x, edge.start.y)*/
				})
				c.restore()	
				voronoi.edges.map(edge => {
					c.moveTo(edge.neighbour.x, edge.neighbour.y)
					c.arc(edge.neighbour.x, edge.neighbour.y, 5, 0, 6.29)
					c.arc(edge.neighbour.x, edge.neighbour.y, 7, 0, 6.29)
					c.arc(edge.neighbour.x, edge.neighbour.y, 9, 0, 6.29)
				})
			}
/*			c.beginPath()
			drawRegion(gui.mapMouse.closest)
			c.stroke()//*/
		}
		if (gui.map.hoverSlider && gui.map.hoverSlider.target) {
			const {x,y} = gui.map.hoverSlider.target.coordinatesOn(gui.map.hoverSlider.target.position, true)
			drawPing(gui.map.hoverSlider.color, x, y)
		}
		c.restore()
	},
	
	renderAnimations(c) {
		for (let point of this.animatingPoints) {
			point.render(c)
			if (!point.animating) {
				this.animatingPoints.delete(point)
				this.updateMapBackground = true
			}
		}
		function renderProgress(point) {
			c.save()
			c.translate(point.x, point.y)
			const end = point.coordinatesOn(point.progress)
			c.moveTo(point.sdx - point.x, point.sdy - point.y)
			c.lineTo(end.x, end.y)
			c.restore()
		}
		function renderQuake(point) {
			c.save()
			const end = {
				x : (point.edx - point.sdx) / 10,
				y : (point.edy - point.sdy) / 10,
			}
			c.moveTo(point.sdx, point.sdy)
			for (let i = 0; i < 10; i++) {
				c.lineTo(point.sdx + i * (end.x + Math.random() - 0.5), point.sdy + i * (end.y + Math.random() - 0.5))
			}
			c.lineTo(point.edx, point.edy)
			
			c.restore()
		}
		function drawHarvest(point) {
			c.save()
			c.translate(point.x, point.y)
			c.moveTo(0, 0)
			c.arc(0, 0, point.renderSize, -1.57, -1.57 + 6.29 * (point.harvestTime / point.harvestTimeTotal))
			c.restore()
		}
		if (settings.meanEffect) {
			c.strokeStyle = gui.theme.lightning
			c.beginPath()
			this.map.renderedPoints.filter(x => !x.owned && x.parent && x.parent.buildings && x.parent.buildings.earthquakeMachine && x.real && x.real.passiveDamage).map(renderQuake)
			c.stroke()
		}
		c.strokeStyle = gui.theme.progress
		c.beginPath()
		this.map.renderedPoints.filter(x => !x.owned && x.progress > 0).map(renderProgress)
		c.stroke()
		if (this.harvesting && this.harvesting.size) {
			c.save()
			c.fillStyle = gui.theme.shades[4]
			c.globalAlpha = 0.7
			c.beginPath()
			this.map.renderedPoints.filter(x => x.harvesting).map(drawHarvest)
			c.fill()
			c.restore()
		}
		this.renderMarkers(c)
		animations.render(c)
	},
	
	renderCircle(c, radius) {
		c.save()
		c.fillStyle = gui.theme.magicbg
		c.strokeStyle = gui.theme.magic
		c.lineWidth = 5
		c.beginPath()
		c.moveTo(radius, 0)
		c.arc(0, 0, radius, 0, 6.29)
		c.fill()
		if (radius > 50) {
			c.moveTo(radius-15, 0)
			c.arc(0, 0, radius - 15, 0, 6.29)
			const length = (radius - 7.5) / 10 | 0
			const step = Math.PI / length
			let angle = 0
			for (let i = 0; i < length; i++) {
				angle += step
				c.lineTo(radius * Math.cos(angle), radius * Math.sin(angle))
				angle += step
				c.lineTo((radius - 15) * Math.cos(angle), (radius - 15) * Math.sin(angle))
			}
		}
		c.stroke()
		c.restore()
	},
	
	renderMarkers(c) {
/*
			c.save()
			c.beginPath()

			c.globalAlpha = 0.5
			c.fillStyle = this.renderData.radar
			c.arc(0,0,game.map.size * 2, 0, 6.29)
			c.translate(-gui.mainViewport.halfWidth / gui.mainViewport.min.zoom, -gui.mainViewport.halfHeight / gui.mainViewport.min.zoom)
			c.fill()
			c.restore()
//*/
		if (!this.map.markers) 
			return
		
		const frame = this.frame % 500

		if (this.renderData.radar && frame < 250) {
			c.save()
			c.beginPath()

			c.globalAlpha = 1 - (frame / 250)
			c.strokeStyle = this.renderData.radar
						
			this.map.markers.map(pt => {
				c.moveTo(pt.x + frame * 2, pt.y)
				c.arc(pt.x, pt.y, frame * 2, 0, 6.29)
			})
			
			c.translate(-gui.mainViewport.halfWidth / gui.mainViewport.min.zoom, -gui.mainViewport.halfHeight / gui.mainViewport.min.zoom)
			c.stroke()
			c.restore()
		}		
	},
	
	now(precise = false) {
		if (precise)
			return (this.statistics.onlineTime || 0) + (this.statistics.offlineTime || 0)
		return Math.round((this.statistics.onlineTime || 0) + (this.statistics.offlineTime || 0))
	},
	
	setMap(name, retain = false) {
		if (this.map) {
			this.map.destroyDisplays()
		}
	
		const oldMap = this.activeMap
		
//		if (this.maps[this.activeMap] && retain)
//			this.maps[this.activeMap] = JSON.parse(JSON.stringify(this.maps[this.activeMap]))

		this.animatingPoints.clear()
		animations.reset()

		//FIX BEHAVIOR FOR TRANSITION IF CLONES AVAILABLE BY THE TIME
		//VIRTUAL MAPS ARE ON

		const depth = retain ? this.map.points[0].mineDepth || 0 : 0
		const miners = retain ? this.sliders.filter(x => x.target && x.target.index == 0) : []
		if (retain)
			this.production.mana += this.skills.magic?(this.map.manaBase) * (this.map.ownedRadius ** 2):0
				
		if (retain) {
			this.sliders.map(x => x.assignTarget(null))
		}

		this.activeMap = name
		this.map = this.maps[name]// = GameMap(this.maps[name], mapLoader)
		if (name == "main") this.realMap = this.map

		if (retain) {
			this.sliders.filter (x => x.clone == 2).map(x => x.fullDestroy())
			while (this.pulses.length)
				this.pulses[0].destroy()
			this.production.mana -= this.skills.magic?(this.map.manaBase) * (this.map.ownedRadius ** 2):0
			miners.map(x => x.assignTarget(this.map.points[0]))

			if (name != "main") {
				this.sliders.map(slider => {
					Object.keys(slider.stats).map(x => {
						if (slider.end[name]) {
							slider.start[name][x] += slider.stats[x] - (slider.end[name][x] || slider.start[name][x] || 0)
						}
					})
				})				
			}
			if (oldMap != "main")
				this.sliders.map(slider => slider.end[oldMap] = Object.assign({}, slider.stats))			
			this.maps[oldMap].lastLeft = this.now()
			
			if (this.map.relativeStart && this.map.lastLeft && !this.map.complete)
				this.map.relativeStart += this.now() - this.map.lastLeft

			;[...this.sliders].sort((x,y) => +(x.role == ROLE_LEADER) - +(y.role == ROLE_LEADER)).map(x => x.autoTarget())
//			this.sliders.map(x => x.autoTarget())
			this.map.points[0].mineDepth = depth
		}
		gui.target.reset()
		gui.hover.reset()

		gui.mapMouse.closest = null		
//		this.map.restoreState()
		this.update()
		gui.tabs.setTitle("map", (this.map.virtual?"Virtual map":"Map")+" (Level " + this.map.level + ")")
		gui.skills.updateSkills()
		this.unlockStory((this.map.virtual?"v":"m")+this.map.level.digits(3)+"")
		gui.mainViewport.init(this.map.bounds)
		gui.worldViewport.init(this.world.bounds)
	},
	
	setWorld(name, update = true) {
		if (!this.worlds[name]) 
			return
		gui.worldMouse.state = MOUSE_STATE_FREE
		delete gui.worldMouse.target
		this.world = this.worlds[name]
		this.activeWorld = name
		update && this.map && this.update()
		gui.world.update(true)
		gui.world.hover.reset()
		gui.world.target.reset()
		gui.worldViewport.init(this.world.bounds)
	},
	
	unlockStory(x) {
		if (!x || game.story[x]) return
		game.story[x] = Math.round((this.statistics.onlineTime || 0) + (this.statistics.offlineTime || 0))
		gui.story.updateStory()
		if (STORY[x] && STORY[x].forced >= settings.storyDisplay)
			gui.story.popupStory()
	},
	
	updateAvailable() {
		for (let level = 0; level <= POINT_MAX_LEVEL; level++)
			this.available.buildings[level] = Object.values(BUILDINGS).filter(x => game.skills["build"+x.level] && level >= x.level)
		this.available.spells = Object.values(SPELLS).filter(x => game.skills.spellcasting && game.skills["book_"+x.book])
	},

	update() {
		this.updateAvailable()
		this.map.update()
		this.world.update()
		//this.production.mana = this.skills.magic?(this.map.level ** 2) * (this.map.ownedRadius ** 2) / 1e8:0
		if (!this.offline) {
			this.map && gui.mainViewport.getLimits(this.map.bounds)
			this.updateMapBackground = true
			this.updateWorldBackground = true
			gui.updateTabs()
			gui.skills.updateSkills()
			this.updateRenderData()
			this.getFullMoney()
			this.updateHarvesting()
		}
		this.nextTarget = true
	},
	
	updateHarvesting() {
		this.harvesting.clear()
		Object.values(this.maps).map(m => m.points.filter(x => x.harvesting).map(x => this.harvesting.add(x)))
	},
	
	ascend(repeat = false) {
		if (this.map.markers && this.map.markers.length) 
			return
			
		if ((this.resources.stars >= this.map.ascendCost || this.map.virtual) && !this.map.boss || this.map.boss && !this.map.points.filter(x => x.boss == this.map.boss && !x.owned).length) {
			
			let progress = game.realMap.level > 20 && game.map.points.filter(x => x.boss && x.boss > game.map.boss).length
			if (!progress && !this.map.virtual) {
				let txt = ""
				if (!game.map.complete) txt += "The map is not completed.\n"
				if (game.map.points.some(x => x.exit && !x.owned)) txt += "There are stars you are leaving behind.\n"
				if (game.skills.book_enchantments1 && game.map.points.some(x => x.index && !x.enchanted && !x.boss && (x.manaCosts.enchantDoom || x.manaCosts.enchantGold || x.manaCosts.enchantMana || x.manaCosts.enchantGrowth))) txt += "There are nodes you can enchant.\n"
				if (game.skills.imprint && game.map.points.some(x => x.canImprint && !x.harvested && !x.harvestTime)) txt += "There are nodes you can imprint.\n"
				if (game.map.points.some(x => x.harvesting)) txt += "There are unfinished imprints that will be lost.\n"
				if (!confirm(txt + "Ascend to the next map?"))
					return
			}
			
			gui.hover.reset()
			gui.target.reset()

			let bossPoints = this.map.points.filter(x => x.boss && x.boss > this.map.boss && !x.owned)
			if (bossPoints.length) {
				if (!this.map.boss && !this.map.virtual && !this.skills.starfire) {
					const foundStars = this.map.points.filter(x => x.exit && x.owned).length
					this.resources.stardust += this.resources.stars - foundStars
					this.addStatistic("stardust", this.resources.stars - foundStars)
					this.resources.stars = foundStars - this.map.ascendCost
					this.updateStardust = true
				}
				
				this.map.boss++
				this.map.points.filter(x => x.boss == this.map.boss && x.away == 1).map(x => x.animate(1, 120))
				if (game.skills.sensor)
					this.map.points.filter(x => x.away == 2 && (!x.boss || x.boss <= x.map.boss) && x.parent && x.parent.boss && (x.parent.boss == this.map.boss)).map(x => x.animate(2, 120))
				this.update()
				this.unlockStory((this.map.virtual?"v":"m")+this.map.level.digits(3)+"b"+this.map.boss.digits(1)+"a")
			} else {
				if (!this.map.virtual)
					saveState("_Autosave before ascension")
				
				if (this.map.virtual) {
					const summons = game.sliders.filter(x => x.clone == 2).length
					if (summons && !confirm("You have " + pluralize(summons, ["summon", "summons"]) + ". \n Changing map will make "+pluralize(summons, ["it","them"], true)+" disappear. \n Do you really want to go?")) 
						return
				}
				
				if (!this.map.boss && !this.map.virtual) {
					const foundStars = this.map.points.filter(x => x.exit && x.owned).length
					this.resources.stardust += this.resources.stars - foundStars
					this.addStatistic("stardust", this.resources.stars - foundStars)
					this.resources.stars = foundStars - this.map.ascendCost
				}
			
				if (this.map.virtual) {
					if (repeat) {
						let name = this.activeMap
						let level = this.map.level
						this.deleteMap(name, true)
						this.createMap(name, level, true)
						this.setMap(name)
					} else {
						this.setMap("main", true)
					}
				} else {
					this.sliders.filter(x => x.clone).map (x => x.fullDestroy())
					this.createMap("main", this.realMap.level+(repeat?0:1), false)
					this.setMap("main", true)
					if (this.map.level == 21) 
						gui.guide.show("level21")
				}
			}
			this.getReals()
			this.sliders.map(x => x.autoTarget())
			gui.skills.updateSkills()
			gui.setTheme(settings.theme, this.map.boss?"boss":"main")
		}
	},
	
	createMap(name, level, virtual, focus) {
		this.maps[name] = GameMap(mapLevel(level, virtual), {focus}, mapMaker)	
		this.sliders.map (x => {
			x.start[name] = Object.assign({}, x.stats)
			x.end[name] = Object.assign({}, x.stats)
		})
		return this.maps[name]
	},
	
	deleteMap(name, keepStats = false) {
		const map = this.maps[name]
		this.canStarfield = !!map.complete
		if (this.activeMap == name)
			this.setMap("main", true)
		if (!keepStats) {
			map.points.map(point => point.suspend())
		} else {
			this.production.mana += this.skills.magic?(map.manaBase) * (map.ownedRadius ** 2):0
		}
		map.points.map(point => this.harvesting.delete(point))
		delete this.maps[name]
	},
	
	advance(deltaTime, callback = core.getNextFrame) {
		this.tempOffline = (deltaTime > 60000) && !this.offline
		if (this.tempOffline) this.offline = true
		if (game.dev && game.dev.boost) deltaTime *= game.dev.boost
		
		this.activeRender = !document.hidden && gui.tabs.activeTab == "map" && !this.slowMode && !this.offline
		
		if (settings.slowModeIdle && performance.now() - this.lastAction > settings.slowModeIdle)
			this.enableSlowMode(1)
		
		if (!this.badSave && settings.autosavePeriod && performance.now() - this.lastSave > settings.autosavePeriod) {
			saveState("_Autosave", 1)
			this.lastSave = performance.now()
		}		
		
		if (!this.badSave && settings.cloudPeriod && performance.now() - this.lastCloudSave > settings.cloudPeriod) {
			if (settings.cloudUpdate && cloud.local.username)
				saveState("_Cloud save", 1)
			this.lastCloudSave = performance.now()
		}		
		
/*		this.autoTimer = (this.autoTimer || GAME_AUTOMATION_PERIOD) - deltaTime
		if (this.autoTimer <= 0) {
			this.autoUpgrade()
			this.autoTimer = GAME_AUTOMATION_PERIOD
		}*/

		if (this.offline) {
			gui.dvOffline.classList.toggle("hidden", false)
			this.timeLeft = deltaTime / 1000
//			gui.dvOfflineCountdown.innerText = "TST"+shortTimeString(deltaTime / 1000)
		}
			
		core.setTimeout(() => {
			this.timeStep(deltaTime / 1000, () => {
					
				if (this.tempOffline && this.offline) {
					this.offline = false
					this.update()
				}
		
				this.updateInterface = true
				
				if (!this.feats.mana1 && this.resources.mana >= 1e13)
					this.feats.mana1 = true

				this.getReals()

				callback && callback()
			})
		}, 0)
	},
	
	autoUpgrade() {
		const upgradablePoints = this.map.points.filter(x => x.index && x.owned && !x.boss && !x.completed)
		this.autoUpgrading = 1
		if (game.skills.automation){
			let points = upgradablePoints.filter(x => this.automation.types.includes(x.type) && ((x.level || 0) < this.automation.maxLevel) && (x.costs.levelUp >= 0)).sort((x,y) => x.costs.levelUp - y.costs.levelUp)
			while (points[0] && points[0].costs.levelUp <= this.resources.gold * this.automation.maxCost * 0.01) points.shift().levelUp()
		}
		if (game.skills.buildAutomation) {
			Object.keys(BUILDINGS).map(x => {
				if (!game.automation.buildings[x]) return
				upgradablePoints.map(point => {
					if (point.level < BUILDINGS[x].level) return
					if (point.costs[x] > this.resources.gold * this.automation.maxCost * 0.01 || point.costs[x] < 0) return
					point.build(x)
				})
			})
		}
		if (this.autoUpgrading > 1) {
			this.update()
			gui.target.updateUpgrades()
			if (this.autoUpgrading & 2) {
				if (gui.management.sorting.sortOften && gui.tabs.activeTab == "management") gui.management.update(true)
			}
		}
		this.autoUpgrading = 0
	},
	
	getFullMoney() {
//	calculate full autobuild cost
		const buildings = Object.entries(this.automation.buildings).filter(x => x[1]).map(x => x[0])
		const toFinish = this.map.points.filter(x => x.index && x.owned && (!x.level || x.level < 4 || buildings.filter(b => !x.buildings[b] && x.costs[b] > 0).length))
		this.fullMoney = toFinish.reduce((v, point) => v + (point.costs.levelUp || 0) * ([0,1,9,73,585][4-(point.level || 0)]), 0)
		this.fullMoney += toFinish.reduce((v, point) => v + buildings.filter(b => !point.buildings[b] && point.costs[b] > 0).reduce((v,b) => v + point.costs[b],0), 0)
	},
	
	timeStep(time, callback) {
		this.iterations = GAME_ADVANCE_ITERATIONS
		let totalIterations = GAME_ADVANCE_ITERATIONS_MAX
		let stepsDone = 0
		let startTime = performance.now()
		while (time > 1e-6) {
			this.iterations--
			if (!--totalIterations)
				this.iterations = 0
		
			const manaTime = (!this.resources.mana || this.real.production.mana >= 0) ? time : -(this.resources.mana / this.real.production.mana)
			const expTime = (!this.resources.exp || this.real.production.exp >= 0) ? time : -(this.resources.exp / this.real.production.exp)
			const damageTime = [...this.attacked].reduce((v, point) => {
				if (!point.index || !point.real || point.real.loss <= 0) {
					point.real.loss = 0
					return v
				}
				return Math.min(v, Math.max(0.1, point.real.defence / point.real.loss / 10))
			}, 60)
			
			const deltaTime = this.iterations?Math.min(damageTime, time, manaTime, expTime):time
			
			if (this.offline)
				this.addStatistic("offlineTime", deltaTime * 1000)
			else
				this.addStatistic("onlineTime", deltaTime * 1000)
		
			if (!deltaTime) console.log("Suspicious deltaTime: "+deltaTime, {deltaTime, damageTime, time, manaTime, expTime})
			
			if (this.skills.starfall) {
				this.starTime += deltaTime
				if (this.starTime > 1) {
					let times = Math.floor(this.starTime)
					this.starTime -= times
					if (this.real)
						this.real.stardustChange = 0

					for (let i = 0; i < 5; i++) {
						const map = this.maps["virtual"+i]
						if (map && map.level == this.realMap.level && map.evolved && map.complete) {
							const mapStardust = map.evolved + (map.evolved >= 3?game.world.coreStats.extraStars:0)
							if (this.real) {
								this.real.stardustChange += mapStardust
							}
							const stardustEarned = times * mapStardust
							this.resources.stardust += stardustEarned
							this.addStatistic("stardust", stardustEarned)
						}
					}
					if (this.real.stardustChange == 15 && this.realMap.level >= FEATS.stars1.minMap)
						this.feats.stars1 = true
					this.updateStardust = true
				}
			}
			
			if (game.world.coreStats.mapChargeSpeed) {
				Object.values(game.maps).filter(x => x.virtual && x.focus && x.complete && x.tookTime).map(x => x.addCharge(deltaTime * game.world.coreStats.mapChargeSpeed))
			}
						
			const mul = deltaTime / 2
			this.sliders.map(slider => slider.grow(mul))

			this.getReal()
			
			this.getReals()
			this.getRealProduction()
						
			for (let point of [...this.attacked]) point.attack(deltaTime)
				
			if (this.harvesting && this.harvesting.size) {
				const harvestTime = deltaTime * this.real.harvestSpeed
				for (let point of this.harvesting) point.advanceHarvest(harvestTime)
			}

			this.sliders.map(slider => slider.advance(deltaTime))
			this.pulses.map(pulse => pulse.advance(deltaTime))
			
			this.sliders.map(slider => slider.grow(mul))
	
			RESOURCES.map(x => {
				if (x == 'science' && this.researching)
					this.research[this.researching].advance(this.real.production[x] * mul * 2)
				else
					this.resources[x] += this.real.production[x] * mul * 2
			})

			RESOURCES.map(x => {
				if (this.resources[x] < 1e-8) this.resources[x] = 0
			})

			this.autoTimer = (this.autoTimer || GAME_AUTOMATION_PERIOD) - deltaTime * (this.offline?10:1000)
			if (this.autoTimer <= 0) {
				this.autoUpgrade()
				this.autoTimer = GAME_AUTOMATION_PERIOD
			}

			this.getReal()
			time -= deltaTime
			
			if (this.nextTarget) {
				this.getReals()
				if (game.skills.smartMine)
					this.sliders.filter (x => x.target && (!x.target.index && x.atFilter.autoMine || x.target.index && x.atFilter.autoNew && !x.atFilter.childNext && !(x.role == ROLE_FOLLOWER && [...x.target.attackers].some(y => y.role == ROLE_LEADER && y.team == x.team)))).map(x => x.autoTarget())
				if (game.skills.autoTarget)
					this.sliders.filter (x => !x.target && !x.atFilter.disabled).map(x => x.autoTarget())
				this.nextTarget = false
			}
			
			stepsDone++
			if (performance.now() - startTime > GAME_ADVANCE_ITERATIONS_STEP_TIME) {
				if (!this.offline) {
					this.tempOffline = true
				}
				this.advanceCallback = callback
				this.advanceTimeout = core.setTimeout(() => {
					this.timeStep(time, callback)
				}, 0)
				return
			}
			this.timeLeft = time
		}
		this.timeLeft = 0
		delete this.advanceTimeout
		delete this.advanceCallback
		callback()
	},
	
	stopAdvance() {
		if (!this.advanceTimeout) return
		core.clearTimeout(this.advanceTimeout)
		this.advanceCallback()
		delete this.advanceTimeout
		delete this.advanceCallback
	},
	
	getSkill(skill, free) {
		if (!skill || !SKILLS[skill] || game.skills[skill]) 
			return
		if (!free) {
			if (game.resources.exp < SKILLS[skill].exp * game.skillCostMult) 
				return
			if (SKILLS[skill].map && game.realMap.level < SKILLS[skill].map) 
				return
			if (SKILLS[skill].sliders && game.sliders.length < SKILLS[skill].sliders) 
				return
			if (SKILLS[skill].science && game.resources.science < SKILLS[skill].science)
				return
			game.resources.exp -= SKILLS[skill].exp * game.skillCostMult
		}
		this.map.points.map(point => point.suspend())
		this.skills[skill] = 1
		this.skillCostMult *= SKILLS[skill].mult || 1
		SKILLS[skill].onGet && SKILLS[skill].onGet()
		this.map.points.map(point => point.unsuspend())
		this.update()
		gui.skills.updateSkills()
		gui.skills.updateExp()
		this.unlockStory("s_"+skill)
	},
	
	payStardust(cost) {
		if (game.resources.stardust < cost) return false
		game.resources.stardust -= cost
		
		let stardustTotal = POINT_TYPES.slice(1).reduce((v, y) => v + game.stardust[y], 0)
		
		let n = -1
		while (stardustTotal > game.resources.stardust) {
			n = (n + 1) % 4
			if (game.stardust[POINT_TYPES[n + 3]] <= 0) continue
			game.stardust[POINT_TYPES[n + 3]]--
			stardustTotal--
		}
		return true
	},
		
	addStatistic(name, value = 1) {
		this.statistics[name] = (this.statistics[name] || 0) + value
	},
	
	getReal() {
		if (!this.real) this.real = {}
		if (!this.real.multi) this.real.multi = {}
		if (!this.real.growth) this.real.growth = {}
		if (!this.real.production) this.real.production = {}

		this.real.harvestSpeed = this.world.stats.harvestSpeed / this.harvesting.size

		Object.keys(this.growth).map(x => {
			this.real.multi[x] = this.multi[x] * (1 + 1 * (this.stardust[x] || 0) * (this.resources.clouds || 0))
			if (x == "spirit") {
				if (this.skills.spiritStar)
					this.real.multi.spirit *= 1 + this.resources.stars * this.resources.stardust
				if (this.real.multi.spirit > this.world.coreStats.spiritCap)
					this.real.multi.spirit = this.world.coreStats.spiritCap
			} else if (x == "power") {
				if (this.real.multi.power > this.world.coreStats.powerCap)
					this.real.multi.power = this.world.coreStats.powerCap
				if (this.real.multi.power >= 1e15)
					this.feats.power1 = 1
			} else {
				if (this.real.multi[x] > this.world.coreStats.elementalCap)
					this.real.multi[x] = this.world.coreStats.elementalCap
			}
			this.real.growth[x] = this.growth[x] * this.real.multi[x]
		})
		if (this.real.multi.ice >= 1e15 && this.real.multi.fire >= 1e15 && this.real.multi.metal >= 1e15 && this.real.multi.blood >= 1e15)
			this.feats.elemental1 = true
		
	},
	
	getReals(extraSlider) {
		if (extraSlider) game.sliders.push(extraSlider)
		
		this.attacked.clear()
		
		const pointsLen = this.map.points.length
		for (let i = 0; i < pointsLen; ++i)
			this.map.points[i].getReal()
		
		this.getRealSliders()
		
/*		const nearbyPointsLen = this.map.nearbyPoints.length
		for (let i = 0; i < nearbyPointsLen; ++i)
			this.map.nearbyPoints[i].getDamage()*/
		
		for (let i = 0; i < pointsLen; ++i)
			this.map.points[i].getDamage()

		if (extraSlider) game.sliders.pop()
	},
	
	alignDamage(value, element, targetElement, chapter = 1) {
		return value * DAMAGE_MATRIX[chapter][element][targetElement]
	},

	getRealSliders() {
		const slidersLength = this.sliders.length

		for (let i = 0; i < slidersLength; ++i)
			this.sliders[i].getBaseRealGrowth()
		
		//apply elementShare
		for (let n = 3; n < 7; ++n) {
			const name = POINT_TYPES[n]
			if (this.world.coreStats[name+"Share"]) {
				let totalAmount = 0
				for (let i = 0; i < slidersLength; ++i) {
					if (!this.sliders[i].clone)
						totalAmount += this.sliders[i].real.growth[name]
				}
				for (let i = 0; i < slidersLength; ++i) {
					if (!this.sliders[i].clone)
						this.sliders[i].real.growth[name] = totalAmount
				}
			}
		}						

		for (let i = 0; i < slidersLength; ++i)
			this.sliders[i].applyGrowthArtifacts()

		for (let i = 0; i < slidersLength; ++i)
			this.sliders[i].getReal()

		if (!this.real.flagBonus)
			this.real.flagBonus = {}

		for (let n = 0; n < 7; ++n) {
			this.real.flagBonus[POINT_TYPES[n]] = 0
			if (n > 2) {
				const name = POINT_TYPES[n]
				const artifact = ARTIFACTS[name+"Flag"]
				if (artifact.equipped)
					this.real.flagBonus[name] += artifact.equipped.real[name]
			}
		}


		for (let i = 0; i < slidersLength; ++i)
			this.sliders[i].getAttack()

	},

	getRealProduction() {
		RESOURCES.map (x => this.real.production[x] = this.production[x])
		this.real.production.mana += this.skills.magic?(this.map.manaBase) * (this.map.ownedRadius ** 2):0
		let slidersLength = this.sliders.length
		this.real.production.mana *= this.world.stats.manaSpeed
		this.real.production.science *= this.world.stats.scienceSpeed
		for (let i = 0; i < slidersLength; ++i) {
			const slider = this.sliders[i]
			if (slider.real) {
				RESOURCES.map(x => {
					if (slider.real.production[x]) 
						this.real.production[x] += slider.real.production[x] * (slider.real.production[x] > 0 ? x == "mana" ? this.world.stats.manaSpeed : x == "science" ? this.world.stats.scienceSpeed : 1 : 1)
				})
				if (slider.target && !slider.target.index)
					this.real.production.gold += slider.real.attack
			}
		}
	},
		
	enableSlowMode(x = 1) {
//		console.log("Set slow mode "+x)
		if (this.slowMode) {
			this.slowMode = Math.max(this.slowMode, x)
			return
		}
		this.slowMode = x
		core.worker.postMessage({
			name : "setFPS",
			value : settings.slowDataFPS
		})
		gui.oldTab = gui.tabs.activeTab
		if (settings.slowModeMap || gui.tabs.activeTab == "map")
			gui.tabs.setTab("map")
//		gui.map.foreground.classList.toggle("hidden", this.slowMode)
//		gui.map.background.classList.toggle("hidden", this.slowMode)
//		gui.map.dvGrowth.classList.toggle("hidden", this.slowMode)
		gui.map.dvResources.classList.toggle("hidden", this.slowMode)
//		gui.map.dvAscend.classList.toggle("hidden", this.slowMode)
		gui.map.dvSliders.classList.toggle("hidden", this.slowMode)
		gui.map.dvLowLoad.classList.toggle("hidden", !this.slowMode)
		gui.map.updateLowLoad(true)
		gui.hover.reset()
		gui.target.reset()
	},
	
	disableSlowMode() {
//		console.log("Unset slow mode")
		this.slowMode = 0
		core.worker.postMessage({
			name : "setFPS",
			value : settings.dataFPS
		})
		if (settings.slowModeMap || gui.tabs.activeTab == "map")
			gui.tabs.setTab(gui.oldTab || "map")
//		gui.map.foreground.classList.toggle("hidden", this.slowMode)
//		gui.map.background.classList.toggle("hidden", this.slowMode)
		gui.map.dvLowLoad.classList.toggle("hidden", !this.slowMode)
		gui.map.dvGrowth.classList.toggle("hidden", this.slowMode)
//		gui.map.dvAscend.classList.toggle("hidden", this.slowMode)
		gui.map.dvResources.classList.toggle("hidden", this.slowMode)
		gui.map.dvSliders.classList.toggle("hidden", this.slowMode)
		this.updateMapBackground = true
		this.updateWorldBackground = true
		this.updateInterface = true
		this.updateRenderData()
	},
	
	saveSlidersPreset(name) {
		game.sliders.map(x => x.savePreset(name))
		this.sliderPresets[name] = LZString.compressToBase64(JSON.stringify({
			master : masterSlider
		}))
	},
	
	loadSlidersPreset(name) {
		if (!this.sliderPresets[name]) return
		game.sliders.map(x => {
			Object.keys(x.artifacts).map(y => x.unequip(y))
			if (x.presets[name]) {
				if (x.target) 
					x.targetIndex = x.target.index 
				else 
					delete x.targetIndex
				x.assignTarget(null, true)
				delete x.target
			}
		})
		game.sliders.map(x => x.loadPreset(name))
		const data = JSON.parse(LZString.decompressFromBase64(this.sliderPresets[name]))
		const oldFilter = masterSlider.atFilter
		Object.assign(masterSlider, data.master)
		masterSlider.atFilter = Object.assign(oldFilter, masterSlider.atFilter)
		gui.sliders.onSet()
		gui.sliders.master.update(true)
	},
	
	toJSON() {
		this.saveTime = Date.now()
		let o = Object.assign({}, this)
		o.saveSkills = Object.keys(o.skills).filter(x => o.skills[x])
		o.masterSlider = masterSlider
		o.managementSorting = gui.management.sorting
		o.stardustControls = gui.stardust.stardustControls
//		o.tabletSmart = gui.artifacts.smart
		delete o.skills
		delete o.updateMapBackground
		delete o.dev
		delete o.frame
		delete o.lastSave
		delete o.lastCloudSave
		delete o.timeLeft
		delete o.starTime
		delete o.advanceTimeout
		delete o.advanceCallback
		delete o.slowMode
		delete o.nextTarget
		delete o.available
		delete o.activeRender
		delete o.animatingPoints
		delete o.attacked
		delete o.autoTimer
		delete o.real
		delete o.realMap
		delete o.map
		delete o.world
		delete o.renderData
		delete o.offline
		delete o.tempOffline
		delete o.autoUpgrading
		delete o.iterations
		delete o.badSave
		delete o.updateInterface
		delete o.updateStardust
		delete o.fullMoney
		delete o.harvesting
		return o
	},
	
	load(save, hibernated = false, auto = false) {
		if (!save) return
		
		if (!auto)
			saveState("_Autosave before load", 1)

		this.loading = true
		
		delete this.badSave
		delete this.mustImport

		this.stopAdvance()
		
		animations.reset()
		this.animatingPoints.clear()
		Object.keys(this.skills).map(x => this.skills[x] = 0)

		while (this.sliders[0]) 
			this.sliders[0].fullDestroy()
		
		this.starTime = 0
		
		this.growth = save.growth || POINT_TYPES.reduce((v, x, n) => (n ? v[x] = 0 : v, v), {}),
		this.multi = save.multi || POINT_TYPES.reduce((v, x, n) => (n ? v[x] = 1 : v, v), {}),
		Object.assign(this.automation, save.automation)

		this.available = Object.assign({},BASE_AVAILABLE)

		this.attacked.clear()
		this.autoTimer = GAME_AUTOMATION_PERIOD

		this.story = save.story || {}
		this.statistics = save.statistics || {}
		this.lastViewedStory = save.lastViewedStory || 0
		gui.story.updateStory()
		
		this.feats = Object.assign({}, save.feats)
				
		RESOURCES.map(x => {
			this.resources[x] = save.resources && save.resources[x] || 0
			this.production[x] = save.production && save.production[x] || 0
		})
		POINT_TYPES.slice(1).map(x => {
			this.stardust[x] = save.stardust && save.stardust[x] || 0
		})
		LETTERS.map(x => {
			this.letters[x] = save.letters && save.letters[x] || 0
		})
		
		if (!save.worlds && save.world && save.world.presets && Object.entries(save.world.presets).length)
			this.mustImport = true
		this.worlds = save.worlds || {"0" : save.world || BASE_WORLD, "1" : BASE_WORLD}
		Object.keys(this.worlds).map(x => this.worlds[x] = World(BASE_WORLD, this.worlds[x], {id : x}))
		
		const activeWorld = save.activeWorld || "0"
		
		this.setWorld(activeWorld, false)

		this.canStarfield = save.canStarfield || true
		
		Object.assign(gui.management.sorting, BASE_SORTING, save.managementSorting)
		Object.assign(gui.stardust.stardustControls, BASE_STARDUST_CONTROLS, save.stardustControls)
		this.skillCostMult = 1
		save.saveSkills.map(x => {
			this.skills[x] = 1
			this.skillCostMult *= SKILLS[x].mult
		})
		
		this.researching = ARTIFACTS[save.researching]?save.researching:""

		Object.keys(ARTIFACTS).map(x => {
			const researchClass = [Research, NumericResearch][ARTIFACTS[x].researchType || RESEARCH_LETTERS]
			this.research[x] = save.research?researchClass(save.research[x], {name : x}):researchClass({name : x})//Object.assign({}, createArtifactResearch(x), save.research && save.research[x])
		})

		const done = Object.values(this.research).filter(x => x.done).length
		if (done >= 35) this.feats.science1 = true
		
		this.maps = save.maps || {"main" : save.map}
		Object.keys(this.maps).map(x => this.maps[x] = GameMap(this.maps[x], mapLoader))
		
		const activeMap = save.activeMap || "main"
		
		this.realMap = this.maps["main"]
		this.setMap(activeMap, false)
				
		Object.assign(masterSlider, baseMasterSlider, save.masterSlider)

		this.sliders.length = 0
		this.sliders = save.sliders.map(x => Slider(x))

		this.pulses.length = 0
		if (save.pulses)
			this.pulses = save.pulses.map(x => Pulse(x))

//		this.sliders.map(x => x.restoreTarget())
		
		Object.keys(this.sliderPresets).map(x => delete this.sliderPresets[x])
		Object.assign(this.sliderPresets, save.sliderPresets)
		
		this.map.getOwnedRadius()
		
		this.update()
		gui.skills.updateSkills()
		gui.artifacts.updateTitle()
		this.lastSave = performance.now()
		this.lastCloudSave = performance.now()

		this.getReal()
		this.getReals()
		this.getRealProduction()

		this.updateHarvesting()

		this.offline = true
		
		const callback = () => {
			this.offline = false
			this.update()
			
			gui.setTheme(settings.theme, this.map.boss?"boss":"main")
			gui.tabs.setTab("map")
	
			gui.stardust.newMapLevelSlider.setMax(this.realMap.level)
			gui.stardust.newMapLevelSlider.setMin(this.realMap.level / 2 | 0)
			gui.stardust.newMapLevelSlider.steps = gui.stardust.newMapLevelSlider.range
			gui.stardust.newMapLevelSlider.dvRight.innerText = this.realMap.level
			gui.stardust.newMapLevelSlider.setValue(this.realMap.level)
			
			gui.sliders.update(true)
			
			core.getNextFrame && core.getNextFrame()
			
			if (this.mustImport) {
				game.badSave = true
				gui.tabs.setTab("world")
				gui.world.importPresets()
				delete this.mustImport
			}
		}

		this.loading = false		

		if (save.saveTime && !hibernated) {
			let time = Math.max(1, Date.now() - save.saveTime)
			this.advance(time, callback)
		} else 
			this.advance(1, callback)

	},
	
	reset(auto) {
		if (!auto)
			saveState("_Autosave before reset", 1)
		
		this.loading = true

		this.stopAdvance()

		animations.reset()
		this.animatingPoints.clear()
		Object.keys(this.skills).map(x => this.skills[x] = this.dev && this.dev.autoSkills && this.dev.autoSkills.includes(x)?1:0)

		this.worlds = {"0" : BASE_WORLD, "1" : BASE_WORLD}
		Object.keys(this.worlds).map(x => this.worlds[x] = World(BASE_WORLD, this.worlds[x], {id : x}))
		
		const activeWorld = "0"
		
		this.setWorld(activeWorld, false)
		
		this.available = Object.assign({},BASE_AVAILABLE)
		RESOURCES.map(x => {
			this.resources[x] = 0
			this.production[x] = 0
		})
		POINT_TYPES.slice(1).map(x => {
			this.stardust[x] = 0
		})
		LETTERS.map(x => {
			this.letters[x] = 0
		})
		this.feats = {}
		Object.assign(this.automation, {
			types : [],
			maxLevel : 0,
			maxCost : 100,
			buildings : {}
		})
		Object.assign(gui.management.sorting, BASE_SORTING)
		Object.assign(gui.stardust.stardustControls, BASE_STARDUST_CONTROLS)
		this.story = {}
		gui.story.updateStory()
		this.lastViewedStory = 0,
		this.statistics = {
			onlineTime : 1
		}
		Object.keys(ARTIFACTS).map(x => {
			const researchClass = [Research, NumericResearch][ARTIFACTS[x].researchType || RESEARCH_LETTERS]
			this.research[x] = researchClass({name : x})
		})
		this.researching = false

		this.starTime = 0
		this.canStarfield = false

		Object.keys(this.growth).map(x => this.growth[x] = 0)
		Object.keys(this.multi).map(x => this.multi[x] = 1)
		Object.keys(this.resources).map(x => this.resources[x] = 0)
		Object.keys(this.stardust).map(x => this.stardust[x] = 0)
		Object.keys(this.production).map(x => this.production[x] = 0)
		this.autoTimer = GAME_AUTOMATION_PERIOD
		this.harvesting.clear()
		
		this.maps = {}
		let map = this.createMap("main", 0, false)
		this.setMap("main", false)

		Object.assign(masterSlider, baseMasterSlider)
		Object.keys(this.sliderPresets).map(x => delete this.sliderPresets[x])
		
		this.sliders && this.sliders.map(x => x.fullDestroy())

		let sliders = Array(1).fill().map(x => Slider({
			stats : {
				power : map.basePower,
				spirit : map.basePower * 5,
			}
		}))

		this.sliders = sliders

		this.pulses.length = 0
		
		let firstTarget = [...this.map.points[0].children][0]
		firstTarget.type = 1
		this.sliders[0].assignTarget(firstTarget)
		this.growth.power = this.map.basePower / 500

		this.skillCostMult = 1
		gui.skills.updateSkills()
		gui.artifacts.updateTitle()
		this.attacked.clear()

		this.getReal()
		this.getReals()
		this.getRealProduction()

		this.loading = false

		this.advance(1, core.getNextFrame)
		this.update()
		gui.setTheme(settings.theme, this.map.boss?"boss":"main")
		gui.tabs.setTab("map")
		gui.sliders.update(true)
	}
}
