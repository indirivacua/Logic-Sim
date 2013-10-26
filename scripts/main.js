var ControlMode = {
	wiring: 0,
	selecting: 1,
	deleting: 2
};

function LogicSim()
{
	this.__proto__ = new Environment();

	var myIsDragging = false;
	var myIsSelecting = false;
	var myCanDrag = false;
	
	var myIsWiring = false;
	var myWireStart = null;
	
	var myGridSize = 8;
	var myGridImage = null;
	
	var myDeleteBtn = null;
	var mySelectBtn = null;
	var myMoveBtn = null;

	var myCtrlDown = false;

	var mySelection = { wires: [], gates: [] };

	this.canvas = null;
	this.context = null;
	
	this.toolbar = null;
	
	this.mouseX = 0;
	this.mouseY = 0;
	
	this.mosueDownPos = null;

	this.customGroup = null;

	this.mode = ControlMode.wiring;
	
	this.initialize = function()
	{
		this.canvas = document.getElementById("canvas");
		this.context = this.canvas.getContext("2d");
		
		this.toolbar = new Toolbar();
		var grp = this.toolbar.addGroup("Tools");
		grp.addItem(new Button.Tool(images.newfile, function() {
			logicSim.gates = new Array();
			logicSim.wireGroups = new Array();
		}));
		grp.addItem(new Button.Tool(images.save, function() {
			Saving.save();
		}));
		grp.addItem(new Button.Tool(images.open, function() {
			Saving.loadFromPrompt();
		}));
		myDeleteBtn = grp.addItem(new Button.Tool(images.delete, function() {
			if (logicSim.mode == ControlMode.deleting)
				logicSim.setMode(ControlMode.wiring);
			else
				logicSim.setMode(ControlMode.deleting);
		}));
		mySelectBtn = grp.addItem(new Button.Tool(images.select, function() {
			if (logicSim.mode == ControlMode.wiring)
				logicSim.setMode(ControlMode.wiring);
			else
				logicSim.setMode(ControlMode.selecting);
		}));

		grp = this.toolbar.addGroup("Logic Gates");
		grp.addItem(new BufferGate());
		grp.addItem(new AndGate());
		grp.addItem(new OrGate());
		grp.addItem(new XorGate());
		grp.addItem(new NotGate());
		grp.addItem(new NandGate());
		grp.addItem(new NorGate());
		grp.addItem(new XnorGate());

		grp = this.toolbar.addGroup("Input");
		grp.addItem(new ConstInput());
		grp.addItem(new ClockInput());
		grp.addItem(new ToggleSwitch());
		grp.addItem(new PushSwitchA());
		grp.addItem(new PushSwitchB());
		grp.addItem(new ICInput());

		grp = this.toolbar.addGroup("Output");
		grp.addItem(new OutputDisplay());
		grp.addItem(new SevenSegDisplay());
		grp.addItem(new ICOutput());

		grp = this.toolbar.addGroup("Flip Flops", true);
		grp.addItem(new DFlipFlop());

		grp = this.toolbar.addGroup("Integrated Circuits", true);
		grp.addItem(new Encoder());
		grp.addItem(new Decoder());
		grp.addItem(new SevenSegDecoder());

		this.customGroup = this.toolbar.addGroup("Custom Circuits");
		
		this.setGridSize(16);
		this.onResizeCanvas();

		Saving.loadFromHash();
	}
		
	this.startDragging = function(gateType)
	{
		if (gateType != null) {
			this.deselectAll();

			var gate = new Gate(gateType, 0, 0);

			mySelection.gates = [gate];
			mySelection.wires = [];
		} else {
			var pos = this.mouseDownPos;

			mySelection.gates = [];
			mySelection.wires = [];

			for (var i = this.gates.length - 1; i >= 0; i--)
			{
				var gate = this.gates[i];
				if (!gate.selected) continue;

				if (myCtrlDown)
				{
					gate.selected = false;
					var data = gate.saveData();
					gate = new Gate(gate.type, gate.x, gate.y);
					gate.loadData(data);
					gate.selected = true;
				}
				else
					this.removeGate(gate);

				mySelection.gates.push(gate);

				gate.x -= pos.x;
				gate.y -= pos.y;
			}

			var wires = this.getAllWires();
			var toRemove = new Array();
			for (var i = wires.length - 1; i >= 0; i--)
			{
				var wire = wires[i];
				if (!wire.selected) continue;

				var copy = wire.clone();

				if (myCtrlDown) {
					wire.selected = false;
				} else {
					toRemove.push(wire);
				}

				copy.selected = true;
				mySelection.wires.push(copy);

				copy.start.x -= pos.x;
				copy.start.y -= pos.y;
				copy.end.x -= pos.x;
				copy.end.y -= pos.y;
			}

			if (!myCtrlDown) {
				this.removeWires(toRemove);
			}
		}

		myIsDragging = true;
	}

	this.getDraggedPosition = function()
	{
		var snap = myGridSize / 2;

		for (var i = this.gates.length - 1; i >= 0; i--)
		{
			var gate = this.gates[i];
			if (gate.selected)
			{
				snap = myGridSize;
				break;
			}
		}

		if (mySelection.gates.length > 0)
			snap = myGridSize;

		return new Pos(
			Math.round(this.mouseX / snap) * snap,
			Math.round(this.mouseY / snap) * snap
		);
	}
	
	this.stopDragging = function()
	{
		myIsDragging = false;

		var pos = this.getDraggedPosition();

		for (var i = mySelection.gates.length - 1; i >= 0; i--)
		{
			var gate = mySelection.gates[i];
			gate.x += pos.x;
			gate.y += pos.y;

			if (this.canPlaceGate(gate))
				this.placeGate(gate);
		}

		for (var i = 0; i < mySelection.wires.length; ++i)
		{
			var wire = mySelection.wires[i];
			wire.start.x += pos.x;
			wire.start.y += pos.y;
			wire.end.x += pos.x;
			wire.end.y += pos.y;

			if (this.canPlaceWire(wire))
				this.placeWire(wire.start, wire.end, true);
		}

		mySelection.gates = [];
		mySelection.wires = [];
	}

	this.setMode = function(mode)
	{
		if (mode == ControlMode.deleting)
		{
			var deleted = false;
			for (var i = this.gates.length - 1; i >= 0; i--)
			{
				var gate = this.gates[i];
				if (gate.selected)
				{
					deleted = true;
					this.removeGate(gate);
				}
			}

			var wires = this.getAllWires();
			var toRemove = new Array();
			for (var i = wires.length - 1; i >= 0; i--)
			{
				var wire = wires[i];
				if (wire.selected)
				{
					deleted = true;
					toRemove.push(wire);
				}
			}
			this.removeWires(toRemove);

			if (deleted) mode = ControlMode.wiring;
		}

		this.mode = mode;

		myDeleteBtn.selected = mode == ControlMode.deleting;
		mySelectBtn.selected = mode == ControlMode.selecting;
	}

	this.startWiring = function(x, y)
	{
		var snap = myGridSize / 2;
	
		myIsWiring = true;
		myWireStart = new Pos(
			Math.round(x / snap) * snap,
			Math.round(y / snap) * snap
		);
	}
	
	this.stopWiring = function(x, y)
	{
		if (this.canPlaceWire(new Wire(myWireStart, this.getWireEnd()))) {
			this.deselectAll();
			this.placeWire(myWireStart, this.getWireEnd());
		}

		myIsWiring = false;
	}
	
	this.getWireEnd = function()
	{
		var snap = 8;
		
		var pos = new Pos(
			Math.round(this.mouseX / snap) * snap,
			Math.round(this.mouseY / snap) * snap
		);
		
		var diff = pos.sub(myWireStart);
		
		if (Math.abs(diff.x) >= Math.abs(diff.y))
			pos.y = myWireStart.y;
		else
			pos.x = myWireStart.x;
			
		return pos;
	}
	
	this.mouseMove = function(x, y)
	{
		this.mouseX = x;
		this.mouseY = y;
		
		this.toolbar.mouseMove(x, y);

		if (!myIsDragging && myCanDrag && this.mouseDownPos != null)
		{
			var diff = new Pos(x, y).sub(this.mouseDownPos);
			if (Math.abs(diff.x) >= 8 || Math.abs(diff.y) >= 8)
				this.startDragging();
		}
	}
	
	this.mouseDown = function(x, y)
	{
		this.mouseX = x;
		this.mouseY = y;
		
		this.mouseDownPos = this.getDraggedPosition();
		
		myCanDrag = false;

		if (x < 256)
			this.toolbar.mouseDown(x, y);
		else
		{
			var pos = new Pos(x, y);
		
			for (var i = 0; i < this.gates.length; ++ i)
			{
				var gate = this.gates[i];
				var rect = new Rect(gate.x + 8, gate.y + 8, gate.width - 16, gate.height - 16);
				
				if (rect.contains(pos))
				{
					gate.mouseDown();
					if (this.mode == ControlMode.selecting)
						gate.selected = !gate.selected;
					else if (this.mode == ControlMode.wiring)
					{
						if (!gate.selected) 
						{
							this.deselectAll();
							gate.selected = true;
						} else {
							myCanDrag = true;
						}
						return;
					}
				}
			}

			
			var gsize = myGridSize / 2;
			pos.x = Math.round(pos.x / gsize) * gsize;
			pos.y = Math.round(pos.y / gsize) * gsize;
			
			for (var i = 0; i < this.wireGroups.length; ++ i)
			{
				var group = this.wireGroups[i];
				if (group.crossesPos(pos))
				{
					var wire = group.getWireAt(pos);

					if (this.mode == ControlMode.selecting)
						wire.selected = !wire.selected;
					else if (this.mode == ControlMode.wiring)
					{
						if (!wire.selected) 
						{
							this.deselectAll();
							wire.selected = true;
						} else {
							myCanDrag = true;
							return;
						}
					}
				}
			}
			
			if (this.mode == ControlMode.wiring)
				this.startWiring(x, y);
		}
	}
	
	this.mouseUp = function(x, y)
	{
		this.mouseX = x;
		this.mouseY = y;
		
		if (myIsDragging)
			this.stopDragging();
		else if (myIsWiring)
			this.stopWiring();
		else if (x < 256)
			this.toolbar.mouseUp(x, y);
		else
		{
			var pos = new Pos(x, y);
			
			var deleted = false;
		
			for (var i = 0; i < this.gates.length; ++ i)
			{
				var gate = this.gates[i];
				
				if (gate.isMouseDown)
				{
					var rect = new Rect(gate.x + 8, gate.y + 8, gate.width - 16, gate.height - 16);
					
					if (rect.contains(pos))
					{
						if (this.mode == ControlMode.deleting && !deleted)
						{
							this.removeGate(gate);
							deleted = true;
						}
						else
							gate.click();
					}
					
					gate.mouseUp();
				}
			}
			
			if (this.mode == ControlMode.deleting && !deleted)
			{
				var gsize = 8;
				pos.x = Math.round(pos.x / gsize) * gsize;
				pos.y = Math.round(pos.y / gsize) * gsize;
				
				if (this.mouseDownPos.equals(pos))
				{
					for (var i = 0; i < this.wireGroups.length; ++ i)
					{
						var group = this.wireGroups[i];
						if (group.crossesPos(pos))
						{
							var wire = group.getWireAt(pos);
							this.removeWire(wire);
							break;
						}
					}
				}
			}
		}

		this.mouseDownPos = null;
	}
	
	this.click = function(x, y)
	{
		this.mouseX = x;
		this.mouseY = y;
		
		if (x < 256)
			this.toolbar.click(x, y);
	}
	
	this.keyDown = function(e)
	{
		if (e.keyCode == 46) this.setMode(ControlMode.deleting);
		if (e.keyCode == 16) this.setMode(ControlMode.selecting);
		if (e.keyCode == 17) myCtrlDown = true;

		if (e.keyCode == 83 && e.ctrlKey)
		{
			Saving.save();
			e.preventDefault();
		}

		if (e.keyCode == 79 && e.ctrlKey)
		{
			Saving.loadFromPrompt();
			e.preventDefault();
		}
	}
	
	this.keyUp = function(e)
	{
		if ((e.keyCode == 46 && this.mode == ControlMode.deleting)
			|| (e.keyCode == 16 && this.mode == ControlMode.selecting))
			this.setMode(ControlMode.wiring);

		if (e.keyCode == 17) myCtrlDown = false;
	}

	this.getGridSize = function()
	{
		return myGridSize;
	}

	this.setGridSize = function(size)
	{
		myGridSize = size;
		myGridImage = document.createElement("canvas");
		myGridImage.width = myGridSize * 2;
		myGridImage.height = myGridSize * 2;
		
		var context = myGridImage.getContext("2d");
		
		context.fillStyle = "#CCCCCC";
		context.fillRect(0, 0, myGridSize * 2, myGridSize * 2);
		context.fillStyle = "#DDDDDD";
		context.fillRect(0, 0, myGridSize, myGridSize);
		context.fillRect(myGridSize, myGridSize, myGridSize, myGridSize);
	}

	this.onResizeCanvas = function()
	{
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
	}

	this.render = function()
	{
		this.context.fillStyle = this.context.createPattern(myGridImage, "repeat");
		this.context.fillRect(256, 0, this.canvas.width - 256, this.canvas.height);
		
		this.__proto__.render(this.context);
		
		this.toolbar.render(this.context);
		
		if (myIsDragging)
		{
			var pos = this.getDraggedPosition();

			for (var i = mySelection.gates.length - 1; i >= 0; i--)
			{
				var gate = mySelection.gates[i];
				gate.x += pos.x;
				gate.y += pos.y;
				gate.render(this.context);
				gate.x -= pos.x;
				gate.y -= pos.y;
			}

			for (var i = mySelection.wires.length - 1; i >= 0; i--)
			{
				var wire = mySelection.wires[i];
				wire.start.x += pos.x;
				wire.start.y += pos.y;
				wire.end.x += pos.x;
				wire.end.y += pos.y;
				wire.render(this.context);
				wire.start.x -= pos.x;
				wire.start.y -= pos.y;
				wire.end.x -= pos.x;
				wire.end.y -= pos.y;
			}
		}
		else if (myIsWiring)
		{		
			var end = this.getWireEnd();
		
			this.context.strokeStyle = this.canPlaceWire(new Wire(myWireStart, this.getWireEnd()))
				? "#009900" : "#990000";
			this.context.lineWidth = 2;
			this.context.beginPath();
			this.context.moveTo(myWireStart.x, myWireStart.y);
			this.context.lineTo(end.x, end.y);
			this.context.stroke();
			this.context.closePath();
		}
	}
	
	this.run = function()
	{
		setInterval(this.mainLoop, 1000.0 / 60.0, this);
	}
	
	this.mainLoop = function(self)
	{
		for (var i = 0; i < self.gates.length; ++ i)
			self.gates[i].step();
			
		for (var i = 0; i < self.gates.length; ++ i)
			self.gates[i].commit();
			
		self.render();
	}
}

logicSim = new LogicSim();

window.onload = function(e)
{
	if (!images.allImagesLoaded())
	{
		images.onAllLoaded = function()
		{
			logicSim.initialize();
			logicSim.run();
		}
	}
	else
	{
		logicSim.initialize();
		logicSim.run();
	}
}

window.onmousemove = function(e)
{
	if (e)
		logicSim.mouseMove(e.pageX, e.pageY);
	else
		logicSim.mouseMove(window.event.clientX, window.event.clientY);
}

window.onmousedown = function(e)
{
	if (e)
		logicSim.mouseDown(e.pageX, e.pageY);
	else
		logicSim.mouseDown(window.event.clientX, window.event.clientY);
}

window.onmouseup = function(e)
{
	if (e)
		logicSim.mouseUp(e.pageX, e.pageY);
	else
		logicSim.mouseUp(window.event.clientX, window.event.clientY);
}

window.onclick = function(e)
{
	if (e)
		logicSim.click(e.pageX, e.pageY);
	else
		logicSim.click(window.event.clientX, window.event.clientY);
}

window.onkeydown = function(e)
{
	logicSim.keyDown(e);
}

window.onkeyup = function(e)
{
	logicSim.keyUp(e);
}

function onResizeCanvas()
{
	logicSim.onResizeCanvas();
}