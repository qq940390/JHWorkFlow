/**
 * JHWorkFlow 工作流JS类
 * 修改自： Gooflow
 *
 * @author modified by wujinhai<940390@qq.com>
 * @package System
 * @version 1.0
 */

(function($) {
    
    Array.prototype.inArray = function(e) {
        for(i=0;i<this.length && this[i]!=e;i++);
        return !(i==this.length);
    };

    JHWorkFlow = {
        //对象初始化函数
        createInstance: function(frameSelector, _cfg) {
            var config = {
                processName: 'process',   //流程名，英文数组组合，默认为 process
                width: 980,         //流程图实例宽度
                height: 600,        //流程图示例高度
                haveHead: true,     //是否显示头部
                headLabel: '新建流程',  //流程图名称
                haveTool: true,     //是否显示工具栏
                haveGroup: true,    //是否启用分组功能
                rollback: true,     //是否开启回滚操作
                headBtns: ["new", "open", "save", "undo", "redo", "reload"], //如果 haveHead = true ，则定义HEAD区的按钮，小写
                headBtnsTitle: {new: "新建流程图", open: "打开流程图", save: "保存", undo: "撤销操作", redo: "重做操作", reload: "重新加载流程图"},
                toolBtns: ["start", "end", "node"], //小写
                toolBtnsTitle: {cursor: "选择指针", start: "起始节点", end: "结束节点", node: "普通节点"},
                color: {    //默认颜色
                    mark: "#ff3300",    //连接线标注时时颜色
                },
                workAreaMenu: {
                    id: '',         //右键点击node时，弹出的菜单dom ID
                    bindings: {}    //绑定的事件
                },
                nodeMenu: {
                    id: '',         //右键点击node时，弹出的菜单dom ID
                    bindings: {}    //绑定的事件
                },
            }
            $.extend(config, _cfg); //合并配置


            var instance = {
                Node: {},
                Line: {},
                Area: {},
                $JP: {},                //jsPlumb 的实例化对象
                $processName: '',       //流程名
                $placeholderId: '',     //实例化的placeholder对象ID
                $frameDom: null,       //流程图框架dom
                $width: config.width,
                $height: config.height,
                $headHeight: 0,         //头部高度
                $toolWidth: 0,          //工具栏宽度
                $tool: null,            //左侧工具栏对象
                $head: null,            //顶部标签及工具栏按钮
                $nowType: "cursor",     //当前要绘制的对象类型
                $editable: false,       //工作区是否可编辑
                $workArea: null,       //装载结点/线条/分组区域的工作区。
                $group: null,           //仅用来装配分组区域DOM元素的容器，处于工作区中。
                $saveDom: {},           //保存按钮的dom
                $undoDom: {},          //撤销按钮dom
                $redoDom: {},          //重做按钮dom
                $deletedItem: {},       //在流程图的编辑操作中被删除掉的元素ID集合,元素ID为KEY,元素类型(node,line.area)为VALUE
                $dragDom: false,          //拖拽对象
                $isDrawArea: false,     //是否是在画area
                $editor: {},
                $ghost: {},
                $dataFilter: {
                    node: ['alt', 'marked', 'doing', 'finish'],
                    line: ['alt', 'marked'],
                    area: ['alt']
                },
                //流程图连线类型，分别是，贝塞尔曲线，直线，折线，弧线
                $lineType: 'Flowchart', //默认是折线
                $lineTypes: ['Bezier', 'Straight', 'Flowchart', 'StateMachine'],
                $isChanged: false,


                ready: function(func) {
                    if(typeof jsPlumb == 'undefined') {
                        layer.alert('缺少 jsPlumb 插件，请检查！');
                        return false;
                    }
                    jsPlumb.ready(function(){
                        instance.init();
                        if(typeof func == 'function') func();
                    });
                },
                init: function() {
                    this.$processName = config.processName;

                    this.$frameDom = $(frameSelector);
                    this.$frameDom.addClass("jhworkflow");
                    this.$placeholderId = this.$frameDom.attr("id");
                    this.$frameDom.width(this.$width).height(this.$height);
                    this.$nowType = "cursor";

                    if (config.haveHead) {
                        instance.createHeader();
                        this.$headHeight = this.$head.height();
                        if (config.headBtns) {
                            instance.bindHeaderEvent();
                        }
                    }
                    if (config.haveTool) {
                        instance.createTool();
                        this.$toolWidth = this.$tool.width();
                        if (config.toolBtns) {
                            instance.bindToolEvent();
                        }
                        this.$editable = true; //只有具有工具栏时可编辑
                    }
                    this.$width = this.$width - this.$toolWidth;
                    this.$height = this.$height - this.$headHeight;
                    instance.createWorkArea();

                    instance.$JP = jsPlumb.getInstance({
                        ConnectionOverlays: [
                            [ "Arrow", {
                                location: 1,
                                visible:true,
                                id:"arrow",
                                length: 16,
                                foldback: 0.6
                            } ],
                            [ "Label", {
                                location: 0.5,
                                id: "label",
                                cssClass: "lineLabel",
                                labelStyle: {
                                    fillStyle: 'rgba(0,0,0,0.15)',
                                    color: '#000',
                                    padding: '5px 8px'
                                },
                                events:{
                                    dblclick: LineInstance.lineLabelDblClick,
                                    contextmenu: LineInstance.lineLabelContextmenu
                                }
                            }]
                        ],
                        ReattachConnections: true,  //防止连接线丢失
                        Container: this.$placeholderId+'_workarea'
                    });

                    if (config.haveGroup) {
                        instance.initGroup(this.$width, this.$height);
                    }

                    if (this.$editable) {
                        rollbackHelper.reset();

                        this.$undoDom = this.$head.find('.glyphicon_undo');
                        this.$redoDom = this.$head.find('.glyphicon_redo');
                        this.$saveDom = this.$head.find('.glyphicon_save');
                        this.$undoDom.addClass('disabled');
                        this.$redoDom.addClass('disabled');
                        this.$saveDom.addClass('disabled');
                        this.$undoDom.on('click', function(e){
                            if($(this).hasClass('disabled')) return false;
                            rollbackHelper.undo();
                        });
                        this.$redoDom.on('click', function(e){
                            if($(this).hasClass('disabled')) return false;
                            rollbackHelper.redo();
                        });

                        NodeInstance.bindNodeDropEvent();

                        LineInstance.bindLineEvent();

                        //为了结点而增加的一些集体delegate绑定
                        NodeInstance.initWorkForNode();

                        this.$workArea.contextMenu(config.workAreaMenu.id, {
                            bindings: config.workAreaMenu.bindings,
                            onContextMenu: instance.onWorkAreaContextMenu,
                            onShowMenu: instance.onWorkAreaShowMenu
                        });
                    }

                    //绑定回滚操作改变事件，同步改变撤销和重做按钮样式
                    rollbackHelper.changed = function() {
                        instance.$isChanged = true;
                        var ulen = rollbackHelper.getUndoStackLength();
                        var rlen = rollbackHelper.getRedoStackLength();
                        if(ulen == 0) instance.$undoDom.addClass('disabled');
                        else instance.$undoDom.removeClass('disabled');
                        if(rlen == 0) instance.$redoDom.addClass('disabled');
                        else instance.$redoDom.removeClass('disabled');
                    }
                },
                //创建遮罩层对象
                createGhost: function() {
                    return $("<div class='rs_ghost'></div>").attr({
                        "unselectable": "on",
                        "onselectstart": 'return false'
                    });
                },
                //创建双击后可修改文字的文本框对象
                createTextEditor: function() {
                    return $('<textarea class="texteditor" title="完成后按Tab键或者Ctrl+Enter键确认"></textarea>');
                },
                //创建头部
                createHeader: function() {
                    var html = '';
                    html = '<div class="flow_header">';
                    if (config.headLabel) {
                        html += '<span class="flowtitle" title="' + config.headLabel + '" >' + config.headLabel + '</span>';
                    }
                    html += '<div class="controlbox">';
                    for (var x = 0; x < config.headBtns.length; ++x) {
                        html += '<a href="javascript:;" class="toolbtn glyphicon_' + config.headBtns[x] + '" title="'+config.headBtnsTitle[config.headBtns[x]]+'">';
                        html += '   <i/>';
                        html += '</a>';
                    }
                    html += '</div>';
                    html += '</div>';
                    this.$head = $(html);
                    this.$frameDom.append(this.$head);
                    this.$headHeight = this.$frameDom.find('flow_header').height();
                    this.$head[0].oncontextmenu = function(e) {
                        e.preventDefault();
                        return false;
                    }
                },
                bindHeaderEvent: function() {
                    for (var x = 0; x < config.headBtns.length; ++x) {
                        var funcType = config.headBtns[x];
                        this.$head.find('.glyphicon_'+funcType).on('click', {type: funcType}, function(e) {
                            if($(this).hasClass('disabled')) return false;
                            if(e.data.type != 'undo' && e.data.type != 'redo') {
                                eval('var func = instance.onBtn'+ucFirst(e.data.type)+'Click;');
                                if(typeof func == 'function') func();
                            }
                        });
                    }
                },
                createTool: function() {
                    this.$frameDom.append("<div class='tools_panel'><div style='height:" + (this.$height - this.$headHeight) + "px' class='controlbox'></div></div>");
                    this.$tool = this.$frameDom.find(".tools_panel .controlbox");
                    //未加代码：加入绘图工具按钮
                    this.$tool.append("<a type='cursor' class='toolbtn glyphicon_cursor down' id='" + this.$placeholderId + "_btn_cursor' title='"+config.toolBtnsTitle["cursor"]+"'><i/></a>");
                    //加入区域划分框工具开关按钮
                    if (config.haveGroup) {
                        this.$tool.append("<a type='group' class='toolbtn glyphicon_group' id='" + this.$placeholderId + "_btn_group' title='分组划分开关，按住Ctrl，鼠标可以划出分组区域'><i/></a>");
                    }
                    if (config.toolBtns && config.toolBtns.length > 0) {
                        var tmp = "<span/>";
                        for (var i = 0; i < config.toolBtns.length; ++i) {
                            //加入自定义按钮
                            tmp += "<a type='" + config.toolBtns[i] + "' id='" + this.$placeholderId + "_btn_" + config.toolBtns[i].split(" ")[0] + "' class='toolbtn allowdragbtn' title='"+config.toolBtnsTitle[config.toolBtns[i]]+"'><i class='glyphicon_" + config.toolBtns[i] + "'></i></a>";
                        }
                        this.$tool.append(tmp);
                    }
                    this.$tool[0].oncontextmenu = function(e) {
                        e.preventDefault();
                        return false;
                    }
                },
                bindToolEvent: function() {
                    var _this = this;
                    //绑定各个按钮的点击事件
                    this.$tool.find('.toolbtn').on("click", function(e) {
                        var type = $(this).attr("type");
                        //可拖拽创建的不能被选中
                        if($(this).hasClass('allowdragbtn')) return false;
                        instance.switchToolBtn(type);
                        return false;
                    });
                    this.$tool.find('.toolbtn').each(function() {
                        if(!$(this).hasClass('allowdragbtn')) return true;
                        $(this).attr('draggable', true);
                        var dom = $(this).get(0);
                        dom.onselectstart = function(e) {
                            e.preventDefault();
                            return false;
                        }
                        dom.ondragstart = function(e) {
                            var _type = dom.id.split('btn_')[1];
                            instance.switchToolBtn('cursor');
                            var m = mousePosition(e);
                            var X = m.x - instance.$workArea.parent().offset().left + NodeInstance.$initNodeWidth;
                            var Y = m.y - instance.$workArea.parent().offset().top + NodeInstance.$initNodeHeight;
                            //创建拖拽时的克隆对象
                            instance.$dragDom = NodeInstance.createNode('ghost_node', {
                                left:X, top:Y, width:NodeInstance.$initNodeWidth, height:NodeInstance.$initNodeHeight, type:_type, label:'node_'+(NodeInstance.$nodeMaxId+1)
                            });
                            instance.$workArea.append(instance.$dragDom);
                            e.dataTransfer.effectAllowed = "all";
                            e.dataTransfer.setData("text", _type);
                            e.dataTransfer.setDragImage(instance.$dragDom[0], NodeInstance.$initNodeWidth/2 - 1, NodeInstance.$initNodeHeight/2 - 1);
                            return true;
                        }
                        //拖拽时控制对象的坐标
                        dom.ondrag = function(e){
                            var m = mousePosition(e);
                            var X = m.x - instance.$workArea.parent().offset().left + instance.$workArea[0].parentNode.scrollLeft - NodeInstance.$initNodeWidth/2;
                            var Y = m.y - instance.$workArea.parent().offset().top + instance.$workArea[0].parentNode.scrollTop - NodeInstance.$initNodeHeight/2;
                            if(instance.$dragDom) {
                                instance.$dragDom.css({
                                    left:X+'px',
                                    top:Y+'px'
                                });
                            }
                        };
                        //拖拽结束
                        dom.ondragend = function(e) {
                            instance.$dragDom.remove();
                            instance.$dragDom = false;
                            e.preventDefault();
                            return false;
                        }
                    });
                },
                createWorkArea: function() {
                    this.$frameDom.append("<div class='work_panel' style='width:" + (this.$width-2) + "px;height:" + (this.$height - 2) + "px;'></div>");
                    instance.$workArea = $("<div id='"+this.$placeholderId+"_workarea' class='workarea' style='width:" + this.$width * 3 + "px;height:" + this.$height * 3 + "px'></div>").attr({
                        "unselectable": "on",
                        "onselectstart": 'return false'
                    });
                    this.$frameDom.children(".work_panel").append(instance.$workArea);
                },
                //初始化分组区
                initGroup: function(width, height) {
                    instance.$group = $("<div class='workgroup' style='width:" + width * 3 + "px;height:" + height * 3 + "px'></div>"); //存放背景区域的容器
                    instance.$workArea.prepend(instance.$group);
                    instance.$group.addClass('lock');
                    if (!instance.$editable) return;

                    //区域划分框操作区的事件绑定
                    instance.$group.on("mousedown", function(e) {
                        if (e.button == 2) return false;
                        if (instance.$nowType != "group") return;
                        e = e || window.event;
                        if(e.ctrlKey) {
                            instance.$isDrawArea = true;
                            var X, Y;
                            var m = mousePosition(e);
                            X = m.x - $(e.target).offset().left;
                            Y = m.y - $(e.target).offset().top;
                            instance.$ghost = instance.createGhost();
                            instance.$group.append(instance.$ghost);
                            instance.$ghost.removeAttr('style').css({
                                display: "block",
                                width: 0 + "px",
                                height: 0 + "px",
                                top: Y + "px",
                                left: X + "px"
                            });
                            $(document).mousemove(function(e) {
                                if(instance.$isDrawArea) {
                                    if (instance.$nowType != "group") return;
                                    var X, Y;
                                    var m = mousePosition(e);
                                    X = m.x - instance.$ghost.offset().left;
                                    Y = m.y - instance.$ghost.offset().top;
                                    instance.$ghost.css({
                                        width: X + "px",
                                        height: Y + "px",
                                    });
                                }
                            });
                            $(document).mouseup(function(e) {
                                $(document).off('mousemove');
                                $(document).off('mouseup');
                                if(instance.$isDrawArea) {
                                    if (instance.$nowType != "group") return;
                                    var color = ["red", "yellow", "blue", "green"];
                                    var oldX = instance.$ghost.offset().left - $(e.target).offset().left;
                                    var oldY = instance.$ghost.offset().top - $(e.target).offset().top;
                                    var newWidth = instance.$ghost.outerWidth(),
                                        newHeight = instance.$ghost.outerHeight();

                                    AreaInstance.addArea(instance.$processName + AreaInstance.$areaIdSeparator + (AreaInstance.$areaMaxId+1), {
                                        label: "area_" + (AreaInstance.$areaMaxId+1),
                                        left: oldX,
                                        top: oldY,
                                        color: color[(AreaInstance.$areaMaxId+1) % 4],
                                        width: newWidth < 120 ? 120 : newWidth,
                                        height: newHeight < 60 ? 60 : newHeight
                                    });
                                    instance.$ghost.remove();
                                    delete instance.$ghost;
                                    instance.$isDrawArea = false;
                                    return false;
                                }
                            });
                        }
                    });

                    //分组绑定修改文字说明功能
                    instance.$group.on("dblclick", function(e) {
                        if (instance.$nowType != "group") return;
                        e = e || window.event;
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.target.tagName != "LABEL") return false;
                        var oldTxt = e.target.innerHTML;

                        var p = e.target.parentNode;
                        instance.$editor = instance.createTextEditor();
                        $(p).append(instance.$editor);
                        instance.$editor.removeAttr('style').val(oldTxt).css({
                            display: "block",
                            width: $(p).outerWidth() - 23
                        }).data("id", p.id).focus().select();
                        //Ctrl + Enter
                        instance.$editor.on('keydown', function(e){
                            if (e.ctrlKey && e.which ==13){
                                AreaInstance.setLabel(instance.$editor.data("id"), instance.$editor.val(), "area");
                                instance.$editor.off().remove();
                                delete instance.$editor;
                            } else if(e.which == 27) {  // Esc 键
                                instance.$editor.off().remove();
                                delete instance.$editor;
                            }
                        });
                        //可以用tab键确认
                        instance.$editor.one("blur", function(e) {
                            if (e.button == 2) return false;
                            AreaInstance.setLabel(instance.$editor.data("id"), instance.$editor.val(), "area");
                            instance.$editor.off().remove();
                            delete instance.$editor;
                        });
                        return false;
                    });
                    //绑定点击事件
                    instance.$group.click(function(e) {
                        if (instance.$nowType != "group") return;
                        e = e || window.event;
                        switch ($(e.target).attr("class")) {
                            case "rs_close":
                                //删除该分组区域
                                AreaInstance.delArea(e.target.parentNode.parentNode.id);
                                return false;
                        }
                        switch (e.target.tagName) {
                            case "LABEL":
                                return false;
                            case "I":
                                //绑定变色功能
                                var id = e.target.parentNode.id;
                                switch (AreaInstance.$areaData[id].color) {
                                case "red":
                                    AreaInstance.setAreaColor(id, "yellow");
                                    break;
                                case "yellow":
                                    AreaInstance.setAreaColor(id, "blue");
                                    break;
                                case "blue":
                                    AreaInstance.setAreaColor(id, "green");
                                    break;
                                case "green":
                                    AreaInstance.setAreaColor(id, "red");
                                    break;
                                }
                                return false;
                        }

                    });
                },
                //切换左边工具栏按钮,传参TYPE表示切换成哪种类型的按钮
                switchToolBtn: function(type) {
                    this.$tool.find('.toolbtn').removeClass('down');

                    this.$nowType = type;
                    this.$tool.children("#" + this.$placeholderId + "_btn_" + type.split(" ")[0]).addClass("down");
                    if (this.$nowType == "group") {
                        instance.$group.removeClass('lock');
                        NodeInstance.blurNode();
                        for (var areaId in AreaInstance.$areaData) {
                            $('#'+areaId).removeClass("lock").find('.sizeable').css("display", "");
                            //将分组默认设为不可拖拽
                            instance.$JP.setDraggable(areaId, true);
                        }
                    } else {
                        instance.$group.addClass('lock');
                        for (var areaId in AreaInstance.$areaData) {
                            $('#'+areaId).addClass("lock").find('.sizeable').css("display", "none");
                            //将分组默认设为不可拖拽
                            instance.$JP.setDraggable(areaId, false);
                        }
                    }
                },
                //获取结点/连线/分组区域的详细信息
                getItemInfo: function(id, type) {
                    switch (type) {
                    case "node":
                        return NodeInstance.$nodeData[id] || null;
                    case "line":
                        var allLines = instance.$JP.getAllConnections();
                        var lineId = '';
                        for(var i in allLines) {
                            if(!allLines[i].source || !allLines[i].target) continue;
                            lineId = LineInstance.createLineId(allLines[i].source.id, allLines[i].target.id);
                            if(id == lineId) return allLines[i];
                        }
                        return false;
                    case "area":
                        return AreaInstance.$areaData[id] || null;
                    }
                },
                //载入一组数据
                loadData: function(data) {
                    var t = instance.$editable;
                    instance.$editable = false;

                    //设置连线类型
                    var _type = 'Flowchart';
                    if(instance.$lineTypes.inArray(data.lineType)) {
                        _type = data.lineType;
                    }
                    instance.$lineType = _type;

                    for (var i in data.nodes) {
                        if(!data.nodes[i] || typeof data.nodes[i] == 'undefined' || typeof data.nodes[i] == 'function') continue;
                        NodeInstance.addNode(i, data.nodes[i]);
                    }

                    for (var j in data.lines) {
                        if(!data.lines[j] || typeof data.lines[j] == 'undefined' || typeof data.lines[j] == 'function') continue;
                        LineInstance.addLine(j, data.lines[j], true);
                    }

                    for (var k in data.areas) {
                        if(!data.areas[k] || typeof data.areas[k] == 'undefined' || typeof data.areas[k] == 'function') continue;
                        AreaInstance.addArea(k, data.areas[k]);
                    }

                    instance.$editable = t;
                    instance.$deletedItem = {};

                    //将分组默认设为不可拖拽
                    for(var areaId in AreaInstance.$areaData) {
                        instance.$JP.setDraggable(areaId, false);
                    }
                },
                //导出流程图数据
                exportData: function() {
                    var ret = {
                        lineType: instance.$lineType,
                        nodes: {},
                        lines: {},
                        areas: {}
                    };
                    for(var id in NodeInstance.$nodeData) {
                        ret.nodes[id] = NodeInstance.$nodeData[id];
                    }
                    for(var id in LineInstance.$lineData) {
                        ret.lines[id] = LineInstance.$lineData[id];
                    }
                    for(var id in AreaInstance.$areaData) {
                        ret.areas[id] = AreaInstance.$areaData[id];
                    }

                    //过滤掉不保存的属性
                    for (var k1 in ret.nodes) {
                        for(var n in this.$dataFilter.node) {
                            if (ret.nodes[k1][this.$dataFilter.node[n]]) {
                                delete ret.nodes[k1][this.$dataFilter.node[n]];
                            }
                        }
                    }
                    for (var k2 in ret.lines) {
                        for(var n in this.$dataFilter.line) {
                            if (ret.nodes[k1][this.$dataFilter.line[n]]) {
                                delete ret.nodes[k1][this.$dataFilter.line[n]];
                            }
                        }
                    }
                    for (var k3 in ret.areas) {
                        for(var n in this.$dataFilter.area) {
                            if (ret.nodes[k1][this.$dataFilter.area[n]]) {
                                delete ret.nodes[k1][this.$dataFilter.area[n]];
                            }
                        }
                    }
                    return ret;
                },
                //只把本次编辑流程图中作了变更(包括增删改)的元素导出到一个变量中,以方便用户每次编辑载入的流程图后只获取变更过的数据
                exportAlter: function() {
                    var ret = {
                        nodes: {},
                        lines: {},
                        areas: {}
                    };
                    for (var k1 in NodeInstance.$nodeData) {
                        if (NodeInstance.$nodeData[k1].alt) {
                            ret.nodes[k1] = NodeInstance.$nodeData[k1];
                        }
                    }
                    for (var k2 in LineInstance.$lineData) {
                        if (LineInstance.$lineData[k2].alt) {
                            ret.lines[k2] = LineInstance.$lineData[k2];
                        }
                    }
                    for (var k3 in AreaInstance.$areaData) {
                        if (AreaInstance.$areaData[k3].alt) {
                            ret.areas[k3] = AreaInstance.$areaData[k3];
                        }
                    }
                    ret.deletedItem = instance.$deletedItem;
                    return ret;
                },
                //重新加载流程图
                reload: function(newDatas) {
                    var oldDatas = typeof newDatas != 'undefined' ? newDatas : instance.exportData();

                    //先删除连线
                    var allLines = instance.$JP.getAllConnections();
                    var lineId = '';
                    for(var i in allLines) {
                        if(!allLines[i].source || !allLines[i].target) continue;
                        lineId = LineInstance.createLineId(allLines[i].source.id, allLines[i].target.id);
                        instance.$JP.detach(allLines[i]);
                        delete LineInstance.$lineData[id];
                    }
                    LineInstance.$lineData = {};

                    //删除节点
                    for(var id in NodeInstance.$nodeData) {
                        instance.$JP.unmakeSource(id);
                        instance.$JP.unmakeTarget(id);
                        instance.$JP.remove(id);
                        delete NodeInstance.$nodeData[id];
                    }
                    NodeInstance.$nodeData = {};

                    //删除分组
                    for(var id in AreaInstance.$areaData) {
                        delete AreaInstance.$areaData[id];
                        $('#'+id).remove();
                    }
                    AreaInstance.$areaData = {};

                    //重新加载数据
                    instance.loadData(oldDatas);
                    instance.$JP.repaintEverything();
                },
                changeItemData: function(id, data, type) {
                    instance.$isChanged = true;
                    if(type == 'node') {
                        for(var i in data) {
                            NodeInstance.$nodeData[id][i] = data[i];
                        }
                    } else if(type == 'line') {
                        for(var i in data) {
                            LineInstance.$lineData[id][i] = data[i];
                        }
                    } else if(type == 'area') {
                        for(var i in data) {
                            AreaInstance.$areaData[id][i] = data[i];
                        }
                    }
                },
                getMaxItemId: function(id, maxId, type) {
                    var typeStr = '';
                    if(type == 'node') typeStr = NodeInstance.$nodeIdSeparator;
                    else if(type == 'area') typeStr = AreaInstance.$areaIdSeparator;
                    var arr = id.split(typeStr);
                    return Math.max(maxId, parseInt(arr[1]));
                },
                //重构整个流程图设计器的宽高
                reinitSize: function(width, height) {
                    if(!width) width = config.width;
                    if(!height) height = config.height;
                    var w = (width || 980);
                    var h = (height || 600);
                    this.$frameDom.css({
                        height: h + "px",
                        width: w + "px"
                    });
                    this.$headHeight = 0;
                    if (this.$head != null) {
                        this.$headHeight = this.$head.height();
                    }
                    if (this.$tool != null) {
                        this.$tool.css({
                            height: h - this.$headHeight + "px"
                        });
                    }
                    w = w - this.$tool.width() - 2;
                    h = h - this.$headHeight - 2;
                    instance.$workArea.parent().css({
                        height: h + "px",
                        width: w + "px"
                    });
                    instance.$workArea.css({
                        height: h * 3 + "px",
                        width: w * 3 + "px"
                    });
                    if (instance.$group == null) {
                        instance.$group.css({
                            height: h * 3 + "px",
                            width: w * 3 + "px"
                        });
                    }
                },
                //改变任何数据时，修改状态
                dataChanged: function(reset) {
                    if(typeof reset != 'undefined' && reset == true) {
                        instance.$isChanged = false;
                        instance.$saveDom.addClass('disabled');
                        return false;
                    } else {
                        instance.$isChanged = true;
                        instance.$saveDom.removeClass('disabled');
                        return typeof instance.onChanged == 'function' && instance.onChanged();
                    }
                },

                //当工作区右键菜单点击时触发此函数
                //格式 function(e)， e表示event
                onWorkAreaContextMenu: null,

                //当工作区右键菜单显示时触发此函数
                //格式 function(e, menu)，e表示event，menu表示显示的菜单
                onWorkAreaShowMenu: null,

                //当节点右键菜单点击时触发此函数
                //格式 function(e)， e表示event
                onNodeContextMenu: null,

                //当节点右键菜单显示时触发此函数
                //格式 function(e, menu)，e表示event，menu表示显示的菜单
                onNodeShowMenu: null,

                //任何改变都会触发此函数
                //格式 function ，无参
                onChanged: null,

                //下面绑定当结点/线/分组块的一些操作事件,这些事件可直接通过this访问对象本身
                //当操作某个单元（结点/线/分组块）被添加时，触发的方法，返回FALSE可阻止添加事件的发生
                //格式function(id，type, json)：id是单元的唯一标识ID,type是单元的种类,有"node","line","area"三种取值,json即addNode,addLine或addArea方法的第二个传参json.
                onItemAdd: null,

                //当操作某个单元（结点/线/分组块）被删除时，触发的方法，返回FALSE可阻止删除事件的发生
                //格式function(id，type)：id是单元的唯一标识ID,type是单元的种类,有"node","line","area"三种取值
                onItemDel: null,

                //当操作某个单元（结点/分组块）被移动时，触发的方法，返回FALSE可阻止移动事件的发生
                //格式function(id，type,left,top)：id是单元的唯一标识ID,type是单元的种类,有"node","area"两种取值，线line不支持移动,left是新的左边距坐标，top是新的顶边距坐标
                onItemMove: null,

                //当操作某个单元（结点/线/分组块）被重命名时，触发的方法，返回FALSE可阻止重命名事件的发生
                //格式function(id,label,type)：id是单元的唯一标识ID,type是单元的种类,有"node","line","area"三种取值,label是新的名称
                onItemRename: null,

                //当操作某个单元（结点/线）被由不选中变成选中时，触发的方法，返回FALSE可阻止选中事件的发生
                //格式function(id,type)：id是单元的唯一标识ID,type是单元的种类,有"node","line"两种取值,"area"不支持被选中
                onItemFocus: null,

                //当操作某个单元（结点/线）被由选中变成不选中时，触发的方法，返回FALSE可阻止取消选中事件的发生
                //格式function(id，type)：id是单元的唯一标识ID,type是单元的种类,有"node","line"两种取值,"area"不支持被取消选中
                onItemBlur: null,

                //当操作某个单元（结点/分组块）被重定义大小或造型时，触发的方法，返回FALSE可阻止重定大小/造型事件的发生
                //格式function(id，type,width,height)：id是单元的唯一标识ID,type是单元的种类,有"node","line","area"三种取值;width是新的宽度,height是新的高度
                onItemResize: null,

                //当变换某条连接线的端点变更连接的结点时，触发的方法，返回FALSE可阻止重定大小/造型事件的发生
                //格式function(id，newStart,newEnd)：id是连线单元的唯一标识ID,newStart,newEnd分别是起始结点的ID和到达结点的ID
                onLinePointMove: null,

                //当节点类型改变时触发此函数
                //格式 function(id, oldType, newType)： id是节点id，oldType原有类型，newType新类型
                onNodeTypeChanged: null,

                //当流程图连线样式改变时触发此函数
                //格式 function(oldType, newType)： oldType为原有样式，newType为新样式
                onLineTypeChanged: null,

                //用户事件
                onBtnNewClick: null,    //点击新建按钮时
                onBtnOpenClick: null,   //点击打开按钮时
                onBtnSaveClick: null,   //点击保存按钮时
                onBtnReloadClick: null     //点击重新加载按钮时
            }

            var NodeInstance = {
                $nodeData: {},
                $nodeCount: 0,
                $nodeMaxId: 0,
                $focus: "",     //当前被选定的结点,如果没选中或者工作区被清空,则为""
                $nodeIdSeparator: '_node_',
                $initNodeWidth: 120,
                $initNodeHeight: 32,

                //绑定节点的拖拽创建事件
                bindNodeDropEvent: function() {
                    //拖放事件  需要重新调整
                    instance.$workArea.on('dragover', function(e){
                        e.preventDefault();
                    });
                    instance.$workArea.on('dragenter', function(e){
                        return true;
                    });
                    instance.$workArea.get(0).ondrop = function(e){
                        e.preventDefault();
                        if(!instance.$dragDom) {
                            e.stopPropagation();
                            return false;
                        }
                        var _type = e.dataTransfer.getData("Text");
                        //拖放结束时，创建节点
                        var X, Y;
                        var ev = mousePosition(e),
                        t = getElCoordinate(this);
                        X = ev.x - t.left + this.parentNode.scrollLeft - NodeInstance.$initNodeWidth/2;
                        Y = ev.y - t.top + this.parentNode.scrollTop - NodeInstance.$initNodeHeight/2;
                        var initLabel = "node_" + (NodeInstance.$nodeMaxId+1);
                        if(_type == 'start') initLabel = '流程开始';
                        else if(_type == 'end') initLabel = '流程结束';
                        var res = NodeInstance.addNode(instance.$processName + NodeInstance.$nodeIdSeparator + (NodeInstance.$nodeMaxId+1), {
                            label: initLabel,
                            left: X,
                            top: Y,
                            width:NodeInstance.$initNodeWidth,
                            height:NodeInstance.$initNodeHeight,
                            type: _type
                        });
                        e.stopPropagation();
                        return false;
                    }
                },
                initWorkForNode: function() {
                    //绑定点击事件
                    instance.$workArea.on('click', function(e) {
                        NodeInstance.blurNode();
                    });
                    instance.$workArea.on('click', '.node_item', function(e) {
                        NodeInstance.focusNode(e.currentTarget.id, true);
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    });

                    if (!instance.$editable) return;

                    //双击节点中的文字区域时的事件
                    instance.$workArea.on('dblclick', ".nodebody", function(e) {
                        var oldTxt = this.innerHTML;
                        var p = e.target.parentNode;
                        instance.$editor = instance.createTextEditor();
                        $(p).append(instance.$editor);
                        instance.$editor.removeAttr('style').val(oldTxt).css({
                            display: "block",
                            width: $(p).outerWidth() - 31,
                            height: $(p).outerHeight() - 4
                        }).data("id", p.id).focus().select();
                        //Ctrl + Enter
                        instance.$editor.on('keydown', function(e){
                            if (e.ctrlKey && e.which == 13) {
                                NodeInstance.setLabel(instance.$editor.data("id"), instance.$editor.val(), "node");
                                instance.$editor.off().remove();
                                delete instance.$editor;
                            } else if(e.which == 27) {  // Esc 键
                                instance.$editor.off().remove();
                                delete instance.$editor;
                            }
                        });
                        //可以用tab键确认
                        instance.$editor.one("blur", function(e) {
                            if (e.button == 2) return false;
                            NodeInstance.setLabel(instance.$editor.data("id"), instance.$editor.val(), "node");
                            instance.$editor.off().remove();
                            delete instance.$editor;
                        });
                    });

                    //绑定结点的删除功能
                    instance.$workArea.on('click', ".node_item .rs_close", function(e) {
                        if (!e) e = window.event;
                        if(!confirm('是否删除该节点？')) return false;
                        NodeInstance.delNode(NodeInstance.$focus);
                        return false;
                    });

                },
                //创建node html
                createNode: function(id, json) {
                    var mark = json.marked ? " item_mark" : "";
                    var doing = json.doing ? " item_doing" : "";
                    var finish = json.finish ? " item_finish" : "";

                    var initLabel = json.label;
                    if(json.type == 'start') initLabel = '流程开始';
                    else if(json.type == 'end') initLabel = '流程结束';

                    var extenClass = '';
                    if(json.type == 'start') extenClass = ' btn-success';
                    else if(json.type == 'end') extenClass = ' btn-danger';

                    var html = '';
                    html += "<div class='btn btn-default"+extenClass+" btn-sm node_item itemtype_"+json.type + mark + doing + finish + "' id='" + id + "' style='top:" + json.top + "px;left:" + json.left + "px;width:" + (json.width) + "px;height:" + (json.height) + "px;'>";
                    html += '   <div class="glyphicon glyphicon_'+json.type+'"></div>';
                    html += '   <div class="nodebody">'+initLabel+'</div>';
                    html += '</div>';
                    return $(html);
                },
                //增加一个流程结点,传参为一个JSON,有id,label,top,left,width,height,type(结点类型)等属性
                addNode: function(id, json) {
                    if (typeof instance.onItemAdd == 'function' && !instance.onItemAdd(id, "node", json)) return;
                    instance.$editable && instance.dataChanged();
                    if (instance.$editable && config.rollback) {
                        rollbackHelper.pushOper("NodeInstance.delNode", [id]);
                    }
                    if (!json.width || json.width < 90) json.width = 90;
                    if (!json.height || json.height < 32) json.height = 32;
                    if (!json.top || json.top < 0) json.top = 0;
                    if (!json.left || json.left < 0) json.left = 0;

                    //一个流程中，只能有一个起始节点和结束节点
                    for(var i in NodeInstance.$nodeData) {
                        if(NodeInstance.$nodeData[i] && (NodeInstance.$nodeData[i].type == 'start' || NodeInstance.$nodeData[i].type == 'end') && NodeInstance.$nodeData[i].type == json.type) {
                            layer.msg('一个流程中只能有一个'+config.toolBtnsTitle[json.type]);
                            return false;
                        }
                    }

                    var newNode = NodeInstance.createNode(id, json);

                    NodeInstance.$nodeData[id] = json;
                    NodeInstance.$nodeCount++;
                    NodeInstance.$nodeMaxId++;
                    NodeInstance.$nodeMaxId = instance.getMaxItemId(id, NodeInstance.$nodeMaxId, 'node');

                    instance.$JP.getContainer().appendChild(newNode[0]);
                    var el = newNode[0];

                    //绑定尺寸改变，完成时更新对应分组dom
                    sizeableMe(el, instance.$workArea[0], function(info) {
                        NodeInstance.resizeNode(id, info.width, info.height);
                    }, {fix:0, minWidth: 90, minHeight:32});

                    // initialise draggable elements.
                    instance.$JP.draggable(el, {
                        containment:"parent",
                        stop: function(info) {
                            //拖放结束时，同步更改节点位置信息
                            NodeInstance.moveNode(info.el.id, info.pos[0], info.pos[1]);
                        },
                        filter: ".glyphicon, .rs_bottom, .rs_right, .rs_rb, .rs_close"
                    });
                    //当节点类型为 end 最终节点时，不允许作为源节点
                    if(json.type != 'end') {
                        var sourceDom = instance.$JP.makeSource(id, {
                            filter: ".glyphicon",
                            anchor: "Continuous",
                            endpoint:[
                                "Dot", {
                                    radius:4,
                                    cssClass:'dot-point',
                                    hoverClass:'dot-point-hover'
                                }
                            ],
                            connector:[ instance.$lineType, { stub:[5, 5] } ],
                            connectorStyle: {
                                lineWidth: 4,
                                strokeStyle: "#49afcd",
                                joinstyle: "round"
                            },
                            connectorHoverStyle: {
                                lineWidth: 4,
                                strokeStyle: "#da4f49"
                            },
                            paintStyle: {
                                visible:false
                            },
                            hoverPaintStyle: {
                                fillStyle:"#0060ff"
                            },
                            dragOptions:{
                                filter: ".glyphicon, .rs_bottom, .rs_right, .rs_rb, .rs_close"
                            },
                            allowLoopback: false,
                            maxConnections: -1,
                            beforeDrop:function(params) {    //放置到新节点上前
                                if(params.connection.source.id == params.connection.target.id) return false;/*不能链接自己*/
                                //如果保存的流程数据中有重复的，则不允许连接
                                for(var i in LineInstance.$lineData) {
                                    if(LineInstance.$lineData[i].from == params.connection.source.id && LineInstance.$lineData[i].to == params.connection.target.id) {
                                        layer.msg('连接线重复');
                                        return false;
                                    }
                                }
                                return true;
                            },
                            beforeDetach: function(connection) {    //删除连接前
                                return true;
                            }
                        });
                    }

                    var targetDom = instance.$JP.makeTarget(id, {
                        dropOptions: { hoverClass: "dragHover", activeClass:"active" },
                        anchor: "Continuous",
                        endpoint:[
                            "Dot", {
                                radius:4,
                                cssClass:'dot-point',
                                hoverClass:'dot-point-hover'
                            }
                        ],
                        paintStyle: {
                            visible:false
                        },
                        hoverPaintStyle: {
                            fillStyle:"#0060ff"
                        },
                        dragOptions:{
                            filter: ".glyphicon, .rs_bottom, .rs_right, .rs_rb, .rs_close"
                        },
                        allowLoopback: false,
                        maxConnections: -1,
                        beforeDrop:function(params){    //放置到新节点上前
                            if(params.connection.source.id == params.connection.target.id) return false;/*不能链接自己*/
                            //如果保存的流程数据中有重复的，则不允许连接
                            for(var i in LineInstance.$lineData) {
                                if(LineInstance.$lineData[i].from == params.connection.source.id && LineInstance.$lineData[i].to == params.connection.target.id) {
                                    layer.msg('连接线重复');
                                    return false;
                                }
                            }
                            return true;
                        },
                        beforeDetach: function(connection) {    //删除连接前
                            return true;
                        }
                    });

                    instance.$JP.revalidate(id);

                    NodeInstance.fixLabel(id);

                    if (instance.$editable) {
                        if (instance.$deletedItem[id]) delete instance.$deletedItem[id]; //在回退删除操作时,去掉该元素的删除记录
                    }

                    newNode.contextMenu(config.nodeMenu.id, {
                        bindings: config.nodeMenu.bindings,
                        onContextMenu: instance.onNodeContextMenu,
                        onShowMenu: instance.onNodeShowMenu
                    });
                },
                //移动结点到一个新的位置
                moveNode: function(id, left, top) {
                    if (!NodeInstance.$nodeData[id]) return;
                    if (typeof instance.onItemMove == 'function' && !instance.onItemMove(id, "node", left, top)) return;
                    instance.$editable && instance.dataChanged();

                    if (instance.$editable && config.rollback) {
                        var paras = [id, NodeInstance.$nodeData[id].left, NodeInstance.$nodeData[id].top];
                        rollbackHelper.pushOper("NodeInstance.moveNode", paras);
                    }
                    if (left < 0) left = 0;
                    if (top < 0) top = 0;
                    $("#" + id).css({
                        left: left + "px",
                        top: top + "px"
                    });
                    NodeInstance.$nodeData[id].left = left;
                    NodeInstance.$nodeData[id].top = top;
                    if (instance.$editable) {
                        NodeInstance.$nodeData[id].alt = 1;
                    }
                    instance.$JP.revalidate(id);
                },
                //设置结点的尺寸
                resizeNode: function(id, width, height) {
                    if (!NodeInstance.$nodeData[id]) return;
                    if (typeof instance.onItemResize == 'function' && !instance.onItemResize(id, "node", width, height)) return;
                    instance.$editable && instance.dataChanged();

                    if (instance.$editable && config.rollback) {
                        var paras = [id, NodeInstance.$nodeData[id].width, NodeInstance.$nodeData[id].height];
                        rollbackHelper.pushOper("NodeInstance.resizeNode", paras);
                    }
                    $('#'+id).css({
                        width: width + "px",
                        height: height + "px"
                    });
                    NodeInstance.$nodeData[id].width = width;
                    NodeInstance.$nodeData[id].height = height;
                    if (instance.$editable) {
                        NodeInstance.$nodeData[id].alt = 1;
                    }
                    instance.$JP.revalidate(id);
                },
                //删除结点
                delNode: function(id) {
                    if (!NodeInstance.$nodeData[id]) return;
                    if (typeof instance.onItemDel == 'function' && !instance.onItemDel(id, 'node')) return;
                    instance.$editable && instance.dataChanged();

                    var allLines = instance.$JP.getAllConnections();
                    //先删除相关的连线
                    for (var k in allLines) {
                        if(!allLines[k].source || !allLines[k].target) continue;
                        if (allLines[k].source.id == id || allLines[k].target.id == id) {
                            LineInstance.delLine(LineInstance.createLineId(allLines[k].source.id, allLines[k].target.id), allLines[k]);
                        }
                    }
                    //再删除结点本身
                    if (instance.$editable && config.rollback) {
                        var paras = [id, NodeInstance.$nodeData[id]];
                        rollbackHelper.pushOper("NodeInstance.addNode", paras);
                    }

                    instance.$JP.unmakeSource(id);
                    instance.$JP.unmakeTarget(id);
                    instance.$JP.remove(id);

                    delete NodeInstance.$nodeData[id];
                    NodeInstance.$nodeCount--;
                    if (NodeInstance.$focus == id) NodeInstance.$focus = "";

                    if (instance.$editable) {
                        instance.$deletedItem[id] = "node";
                    }
                    instance.$JP.repaintEverything();
                },
                //取消所有结点/连线被选定的状态
                blurNode: function() {
                    if (NodeInstance.$focus != "") {
                        var jq = $("#" + NodeInstance.$focus);
                        if (typeof instance.onItemBlur == 'function' && !instance.onItemBlur(NodeInstance.$focus, "node")) return false;
                        jq.removeClass("item_focus").removeClass("crosshair").find('.sizeable').hide();
                    }
                    NodeInstance.$focus = "";
                    return true;
                },
                //选定某个结点/转换线 bool:TRUE决定了要触发选中事件，FALSE则不触发选中事件，多用在程序内部调用。
                focusNode: function(id, bool) {
                    var jq = $("#" + id);
                    if (jq.length == 0) return;
                    if (!NodeInstance.blurNode()) return; //先执行"取消选中",如果返回FLASE,则也会阻止选定事件继续进行.
                    if (bool && typeof instance.onItemFocus == 'function' && !instance.onItemFocus(id, "node")) return;
                    jq.addClass("item_focus").find('.sizeable').show();
                    NodeInstance.$focus = id;
                    instance.switchToolBtn("cursor");
                },
                //设置结点/连线/分组区域的文字信息
                setLabel: function(id, label) {
                    var oldLabel;
                    if (!NodeInstance.$nodeData[id]) return;
                    if (NodeInstance.$nodeData[id].label == label) return;
                    if (typeof instance.onItemRename == 'function' && !instance.onItemRename(id, label, "node")) return;
                    instance.$editable && instance.dataChanged();

                    oldLabel = NodeInstance.$nodeData[id].label;
                    NodeInstance.$nodeData[id].label = label;
                    $('#'+id).find(".nodebody").text(label);
                    NodeInstance.fixLabel(id);
                    if (instance.$editable) {
                        NodeInstance.$nodeData[id].alt = 1;
                    }
                    //重绘节点及相关连线
                    instance.$JP.revalidate(id);

                    if (instance.$editable && config.rollback) {
                        var paras = [id, oldLabel];
                        rollbackHelper.pushOper("NodeInstance.setLabel", paras);
                    }
                },
                fixLabel: function(id) {
                    if (!NodeInstance.$nodeData[id]) return;
                    var height = $('#'+id).children(".nodebody").height();
                    $('#'+id).height(height);
                    //重绘节点及相关连线
                    instance.$JP.revalidate(id);
                },
                //更改节点的类型
                changeType: function(id, newType) {
                    var node = NodeInstance.$nodeData[id];
                    if(!node) return false;
                    var oldType = node.type;
                    var extenClass = '';
                    if(newType == 'start') extenClass = ' btn-success';
                    else if(newType == 'end') extenClass = ' btn-danger';
                    if(oldType == newType) return false;

                    if (typeof instance.onNodeTypeChanged == 'function' && !instance.onNodeTypeChanged(id, oldType, newType)) return;
                    instance.$editable && instance.dataChanged();

                    //一个流程中只能有一个起始节点和结束节点
                    if(newType == 'start' || newType == 'end') {
                        for(var i in NodeInstance.$nodeData) {
                            if(NodeInstance.$nodeData[i].type == 'start' && newType == 'start') {
                                layer.msg('一个流程中只能有一个'+config.toolBtnsTitle[newType]);
                                return false;
                            }
                            if(NodeInstance.$nodeData[i].type == 'end' && newType == 'end') {
                                layer.msg('一个流程中只能有一个'+config.toolBtnsTitle[newType]);
                                return false;
                            }
                        }
                    }

                    $('#'+id).removeClass('btn-success')
                             .removeClass('btn-danger')
                             .addClass(extenClass)
                             .removeClass("itemtype_"+oldType).addClass("itemtype_"+newType)
                             .find('.glyphicon_'+oldType)
                             .removeClass("glyphicon_"+oldType).addClass("glyphicon_"+newType);

                    NodeInstance.$nodeData[id].type = newType;

                    if (instance.$editable && config.rollback) {
                        var paras = [id, oldType];
                        rollbackHelper.pushOper("NodeInstance.changeType", paras);
                    }

                    return true;
                }
            }

            var AreaInstance = {
                $areaData: {},
                $areaCount: 0,
                $areaMaxId: 0,
                $areaIdSeparator: '_area_',

                addArea: function(id, json) {
                    if (typeof instance.onItemAdd == 'function' && !instance.onItemAdd(id, "area", json)) return;
                    instance.$editable && instance.dataChanged();

                    if (instance.$editable && config.rollback) {
                        rollbackHelper.pushOper("AreaInstance.delArea", [id]);
                    }
                    var newArea = AreaInstance.createArea(id, json);
                    AreaInstance.$areaData[id] = json;
                    instance.$group.append(newArea);
                    AreaInstance.$areaCount++;
                    AreaInstance.$areaMaxId++;
                    AreaInstance.$areaMaxId = instance.getMaxItemId(id, AreaInstance.$areaMaxId, 'area');

                    //绑定尺寸改变，完成时更新对应分组dom
                    sizeableMe(newArea, instance.$group[0], function(info) {
                        AreaInstance.resizeArea(id, info.width, info.height);
                    }, {fix:-2, minWidth: 120, minHeight:50, maxWidth:2000, maxHeight:2000});

                    //绑定拖拽移动
                    instance.$JP.draggable(newArea, {
                        containment:"parent",
                        stop: function(info) {
                            //拖放结束时，同步更改分组位置信息
                            AreaInstance.moveArea(info.el.id, info.pos[0], info.pos[1]);
                        },
                        filter: ".rs_bottom, .rs_right, .rs_rb, .rs_close, .label, .color"
                    });

                    if (instance.$nowType != "group") {
                        newArea.addClass('lock').find('.sizeable').css("display", "none");
                    } else {
                        newArea.removeClass('lock').find('.sizeable').css("display", "block");
                    }
                    if (instance.$editable) {
                        if (instance.$deletedItem[id]) delete instance.$deletedItem[id]; //在回退删除操作时,去掉该元素的删除记录
                    }
                },
                createArea: function(id, json) {
                    var html = '';
                    html += "<div id='" + id + "' class='grouparea area_" + json.color + "' style='top:" + json.top + "px;left:" + json.left + "px;width:" + (json.width) + "px;height:" + (json.height) + "px'>" + "<label class='label'>" + json.label + "</label><i class='color'></i></div>";
                    return $(html);
                },
                //设置区域分块的尺寸
                resizeArea: function(id, width, height) {
                    if (!AreaInstance.$areaData[id]) return;
                    if (typeof instance.onItemResize == 'function' && !instance.onItemResize(id, "area", width, height)) return;
                    instance.$editable && instance.dataChanged();

                    if (instance.$editable && config.rollback) {
                        var paras = [id, AreaInstance.$areaData[id].width, AreaInstance.$areaData[id].height];
                        rollbackHelper.pushOper("AreaInstance.resizeArea", paras);
                    }
                    $('#'+id).css({
                        width: width + "px",
                        height: height + "px"
                    });
                    AreaInstance.$areaData[id].width = width;
                    AreaInstance.$areaData[id].height = height;
                    if (instance.$editable) {
                        AreaInstance.$areaData[id].alt = 1;
                    }
                },
                //设置区域分组的颜色
                setAreaColor: function(id, color) {
                    if (!AreaInstance.$areaData[id]) return;
                    if (instance.$editable && config.rollback) {
                        var paras = [id, AreaInstance.$areaData[id].color];
                        rollbackHelper.pushOper("AreaInstance.setAreaColor", paras);
                    }
                    if (color == "red" || color == "yellow" || color == "blue" || color == "green") {
                        $('#'+id).removeClass("area_" + AreaInstance.$areaData[id].color).addClass("area_" + color);
                        AreaInstance.$areaData[id].color = color;
                    }
                    if (instance.$editable) {
                        AreaInstance.$areaData[id].alt = 1;
                    }
                },
                moveArea: function(id, left, top) {
                    if (!AreaInstance.$areaData[id]) return;
                    if (typeof instance.onItemMove == 'function' && !instance.onItemMove(id, "area", left, top)) return;
                    instance.$editable && instance.dataChanged();

                    if (instance.$editable && config.rollback) {
                        var paras = [id, AreaInstance.$areaData[id].left, AreaInstance.$areaData[id].top];
                        rollbackHelper.pushOper("AreaInstance.moveArea", paras);
                    }
                    if (left < 0) left = 0;
                    if (top < 0) top = 0;
                    $('#'+id).css({
                        left: left + "px",
                        top: top + "px"
                    });
                    AreaInstance.$areaData[id].left = left;
                    AreaInstance.$areaData[id].top = top;
                    if (instance.$editable) {
                        AreaInstance.$areaData[id].alt = 1;
                    }
                },
                //删除区域分组
                delArea: function(id) {
                    if (!AreaInstance.$areaData[id]) return;
                    if (typeof instance.onItemDel == 'function' && !instance.onItemDel(id, 'area')) return;
                    instance.$editable && instance.dataChanged();

                    if (instance.$editable && config.rollback) {
                        var paras = [id, AreaInstance.$areaData[id]];
                        rollbackHelper.pushOper("AreaInstance.addArea", paras);
                    }
                    delete AreaInstance.$areaData[id];
                    $('#'+id).remove();
                    AreaInstance.$areaCount--;
                    if (instance.$editable) {
                        instance.$deletedItem[id] = "area";
                    }
                },
                //设置结点/连线/分组区域的文字信息
                setLabel: function(id, label) {
                    var oldLabel;
                    if (!AreaInstance.$areaData[id]) return;
                    if (AreaInstance.$areaData[id].label == label) return;
                    if (typeof instance.onItemRename == 'function' && !instance.onItemRename(id, label, "area")) return;
                    instance.$editable && instance.dataChanged();

                    oldLabel = AreaInstance.$areaData[id].label;
                    AreaInstance.$areaData[id].label = label;
                    $('#'+id).children("label").text(label);
                    if (instance.$editable) {
                        AreaInstance.$areaData[id].alt = 1;
                    }
                    if (instance.$editable && config.rollback) {
                        var paras = [id, oldLabel];
                        rollbackHelper.pushOper("AreaInstance.setLabel", paras);
                    }
                }
            }

            var LineInstance = {
                $lineData: {},
                $isLineDraged: false,  //连线是否被拖动
                $isLineMoved: false,   //连线是否改变
                $lineIdSeparator: '_lineto_',

                //绑定连线时的事件
                bindLineEvent: function() {
                    instance.$JP.bind('click', LineInstance.lineClick);
                    instance.$JP.bind('contextmenu', LineInstance.lineContextmenu);

                    instance.$JP.bind('connection', function(el, e) {
                        var lineId = LineInstance.createLineId(el.connection.source.id, el.connection.target.id);
                        if(!LineInstance.$lineData[lineId]) {
                            LineInstance.addLine(lineId, {
                                id: lineId,
                                label: "",
                                from: el.connection.source.id,
                                to: el.connection.target.id
                            }, false);
                        }
                    });

                    instance.$JP.bind('connectionMoved', function(el, e) {
                        if(el.originalSourceId != el.newSourceId || el.originalTargetId != el.newTargetId) {
                            LineInstance.$isLineMoved = true;
                            if(LineInstance.$isLineDraged && LineInstance.$isLineMoved) {
                                LineInstance.$isLineDraged = false;
                                LineInstance.$isLineMoved = false;
                                LineInstance.moveLinePoint(el.originalSourceId, el.originalTargetId, el.newSourceId, el.newTargetId, el.connection.getOverlay("label").label, true);
                            }
                        }
                    });

                    instance.$JP.bind('connectionDrag', function(el, e) {
                        LineInstance.$isLineDraged = true;
                    });
                },
                //创建 line ID
                createLineId: function(from, to) {
                    return from+LineInstance.$lineIdSeparator+to;
                },
                //增加一条线
                addLine: function(id, json, isLoad) {
                    if (typeof instance.onItemAdd == 'function' && !instance.onItemAdd(id, "line", json)) return;
                    instance.$editable && instance.dataChanged();

                    if (json.from == json.to) return;
                    var nodeFrom = NodeInstance.$nodeData[json.from],
                        nodeTo = NodeInstance.$nodeData[json.to];

                    if (!nodeFrom || !nodeTo) return;
                    //设置LineInstance.$lineData[id]
                    if(!LineInstance.$lineData[id]) LineInstance.$lineData[id] = {};

                    LineInstance.$lineData[id].from = json.from;
                    LineInstance.$lineData[id].to = json.to;
                    LineInstance.$lineData[id].label = json.label;

                    var lineDom;
                    if(isLoad) {
                        lineDom = instance.$JP.connect({
                            source: json.from,
                            target: json.to
                        });
                        lineDom.getOverlay("label").setLabel(json.label);
                        if (instance.$editable && config.rollback) {
                            rollbackHelper.pushOper("LineInstance.delLine", [id]);
                        }
                    } else {
                        if (instance.$editable && config.rollback) {
                            rollbackHelper.pushOper("LineInstance.delLine", [id]);
                        }
                    }

                    if (instance.$editable) {
                        if (instance.$deletedItem[id]) delete instance.$deletedItem[id]; //在回退删除操作时,去掉该元素的删除记录
                    }
                },
                //删除转换线
                delLine: function(id) {
                    if (!LineInstance.$lineData[id]) return;
                    if (typeof instance.onItemDel == 'function' && !instance.onItemDel(id, 'line')) return;
                    instance.$editable && instance.dataChanged();

                    if (instance.$editable && config.rollback) {
                        var paras = [id, LineInstance.$lineData[id], true];
                        rollbackHelper.pushOper("LineInstance.addLine", paras);
                    }
                    var fromId = LineInstance.$lineData[id].from, toId = LineInstance.$lineData[id].to;
                    if (instance.$editable) {
                        var ele = instance.getItemInfo(id, 'line');
                        if (NodeInstance.$focus == id) NodeInstance.$focus = "";
                        instance.$JP.detach(ele);
                        delete LineInstance.$lineData[id];
                        instance.$deletedItem[id] = "line";
                    }
                    //重绘节点及相关连线
                    instance.$JP.revalidate(fromId);
                    instance.$JP.revalidate(toId);
                },
                delAllLines: function() {

                },
                reBuildAllLines: function(lines) {

                },
                //移动连接线端点
                moveLinePoint: function(oldFrom, oldTo, newFrom, newTo, label, dragMoved) {
                    var oldId = LineInstance.createLineId(oldFrom, oldTo);
                    var lineId = LineInstance.createLineId(newFrom, newTo);

                    if (typeof instance.onLinePointMove == 'function' && !instance.onLinePointMove(id, newStart, newEnd)) return;
                    instance.$editable && instance.dataChanged();

                    if(LineInstance.$lineData[oldId]) delete LineInstance.$lineData[oldId];
                    LineInstance.$lineData[lineId] = {};
                    LineInstance.$lineData[lineId].label = label;
                    LineInstance.$lineData[lineId].from = newFrom;
                    LineInstance.$lineData[lineId].to = newTo;

                    //改变连接线端点
                    if(!dragMoved) {
                        var connectionEle = instance.getItemInfo(LineInstance.createLineId(oldFrom, oldTo), 'line');
                        //printLn(connectionEle)
                        if(oldFrom != newFrom) instance.$JP.setSource(connectionEle, newFrom);
                        if(oldTo != newTo) instance.$JP.setTarget(connectionEle, newTo);
                        instance.$JP.revalidate(newFrom);
                        instance.$JP.revalidate(newTo);
                    }

                    if (instance.$editable && config.rollback) {
                        var paras = [LineInstance.$lineData[lineId].from, LineInstance.$lineData[lineId].to, oldFrom, oldTo, label];
                        rollbackHelper.pushOper("LineInstance.moveLinePoint", paras);
                    }

                    if (instance.$editable) {
                        LineInstance.$lineData[lineId].alt = 1;
                    }
                },
                //按住Ctrl+鼠标左键，可以删除连接线
                lineClick: function(el, e) {
                    if (!instance.$editable) return false;
                    if(e.ctrlKey) {
                        if(confirm('确定删除该连接线？')) {
                            var lineId = LineInstance.createLineId(el.source.id, el.target.id);
                            LineInstance.delLine(lineId, el);
                        }
                    }
                    return  true;
                },
                lineContextmenu: function(el, e) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                },
                lineLabelDblClick: function(el, e) {
                    if (!instance.$editable) return false;
                    var oldTxt = el.label;
                    var p = e.target.parentNode;
                    instance.$editor = instance.createTextEditor();
                    $(p).append(instance.$editor);
                    var labelWidth = $(e.target).outerWidth();
                    var labelHeight = $(e.target).outerHeight();
                    var ew = Math.max(labelWidth, 100);
                    var eh = Math.max(24, labelHeight);
                    instance.$editor.removeAttr('style').val(oldTxt).css({
                        position:'absolute',
                        zIndex:'99',
                        left: $(e.target).offset().left - instance.$workArea.parent().offset().left + instance.$workArea[0].parentNode.scrollLeft - (ew-labelWidth)/2,
                        top: $(e.target).offset().top - instance.$workArea.parent().offset().top + instance.$workArea[0].parentNode.scrollTop,
                        display: "block",
                        width: ew,
                        height: eh
                    }).data("id", LineInstance.createLineId(el.component.source.id, el.component.target.id)).focus().select();
                    //Ctrl + Enter
                    instance.$editor.on('keydown', function(e){
                        if (e.ctrlKey && e.which ==13){
                            LineInstance.setLabel(instance.$editor.data("id"), instance.$editor.val(), "line");
                            instance.$editor.off().remove();
                            delete instance.$editor;
                        } else if(e.which == 27) {  // Esc 键
                            instance.$editor.off().remove();
                            delete instance.$editor;
                        }
                    });
                    //可以用tab键确认
                    instance.$editor.one("blur", function(e) {
                        if (e.button == 2) return false;
                        LineInstance.setLabel(instance.$editor.data("id"), instance.$editor.val(), "line");
                        instance.$editor.off().remove();
                        delete instance.$editor;
                    });

                    return  true;
                },
                lineLabelContextmenu: function(el, e) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                },
                //设置结点/连线/分组区域的文字信息
                setLabel: function(id, label) {
                    var oldLabel;
                    if (!LineInstance.$lineData[id]) return;
                    if (LineInstance.$lineData[id].label == label) return;
                    if (typeof instance.onItemRename == 'function' && !instance.onItemRename(id, label, "line")) return;
                    instance.$editable && instance.dataChanged();

                    var lineEle = instance.getItemInfo(id, 'line');
                    oldLabel = lineEle.getOverlay("label").getLabel();
                    lineEle.getOverlay("label").setLabel(label);
                    LineInstance.$lineData[id].label = label;
                    if (instance.$editable) {
                        LineInstance.$lineData[id].alt = 1;
                    }
                    if (instance.$editable && config.rollback) {
                        var paras = [id, oldLabel];
                        rollbackHelper.pushOper("LineInstance.setLabel", paras);
                    }
                },
                //更改连线样式
                changeType: function(newType) {
                    if (typeof instance.onLineTypeChanged == 'function' && !instance.onLineTypeChanged(instance.$lineType, newType)) return;
                    instance.$editable && instance.dataChanged();

                    var _type = 'Flowchart';
                    if(instance.$lineTypes.inArray(newType)) {
                        _type = newType;
                    }

                    if (instance.$editable && config.rollback) {
                        var paras = [instance.$lineType];
                        rollbackHelper.pushOper("LineInstance.changeType", paras);
                    }

                    instance.$lineType = _type;
                    instance.reload();

                    return _type;
                }
            }

            //获取left，top
            var getElCoordinate = function(dom) {
                var t = dom.offsetTop;
                var l = dom.offsetLeft;
                dom = dom.offsetParent;
                while (dom) {
                    t += dom.offsetTop;
                    l += dom.offsetLeft;
                    dom = dom.offsetParent;
                };
                return {
                    top: t,
                    left: l
                };
            }
            //获取鼠标位置
            var mousePosition = function(ev) {
                if (!ev) ev = window.event;
                if (ev.pageX || ev.pageY) {
                    return {
                        x: ev.pageX,
                        y: ev.pageY
                    };
                }
                return {
                    x: ev.clientX + document.documentElement.scrollLeft - document.body.clientLeft,
                    y: ev.clientY + document.documentElement.scrollTop - document.body.clientTop
                };
            }
            //首字母大写
            var ucFirst = function(str) {
                if(!!str) return str[0].toUpperCase() + str.substr(1);
                else return str;
            }
            var printLn = function(el) {
                for(var i in el) {
                    document.writeln(i + ' : ' + el[i] + "<br/><br/>");
                }
            }

            //给某个对象绑定改变尺寸功能
            var sizeableMe = function(ele, containEle, doneFunc, options) {
                options.fix = typeof options.fix == 'undefined' || 0;
                options.minWidth = options.minWidth || 120;
                options.minHeight = options.minHeight || 60;
                options.maxWidth = options.maxWidth || 600;
                options.maxHeight = options.maxHeight || 600;
                var html = '<div class="sizeable" style="display:none"><div class="rs_bottom"></div><div class="rs_right"></div><div class="rs_rb"></div><div class="rs_close"></div></div>';
                $(ele).append(html);
                //区域划分框操作区的事件绑定
                $(ele).find('.sizeable div').on("mousedown", function(e) {
                    var sizeInfo = {};

                    if (e.button == 2) return false;    //不能是右键
                    e = e || window.event;
                    e.preventDefault();
                    e.stopPropagation();

                    var cursor = $(e.target).css("cursor");
                    var targetEle = e.target.parentNode.parentNode;

                    var ev = mousePosition(e);

                    var X, Y;
                    X = ev.x;
                    Y = ev.y;

                    var oldWidth = $(ele).outerWidth(), oldHeight = $(ele).outerHeight();
                    var newWidth = oldWidth, newHeight = oldHeight;
                    var offsetX = 0, offsetY = 0;
                    var downAndMove = false;

                    $(document).mousemove(function(e) {
                        e = e || window.event;
                        var ev = mousePosition(e);
                        e.preventDefault();
                        e.stopPropagation();
                        if (cursor != "move") {
                            downAndMove = true;
                            offsetX = ev.x - X;
                            offsetY = ev.y - Y;
                            newWidth = oldWidth + offsetX + options.fix;
                            newHeight = oldHeight + offsetY + options.fix;
                            if (newWidth < options.minWidth) newWidth = options.minWidth;
                            if (newHeight < options.minHeight) newHeight = options.minHeight;
                            if (newWidth > options.maxWidth) newWidth = options.maxWidth;
                            if (newHeight > options.maxHeight) newHeight = options.maxHeight;
                            switch (cursor) {
                                case "nw-resize":
                                    $(ele).css({
                                        width: newWidth + "px",
                                        height: newHeight + "px"
                                    });
                                    break;
                                case "w-resize":
                                    newHeight = oldHeight + options.fix;
                                    $(ele).css({
                                        width: newWidth + "px"
                                    });
                                    break;
                                case "n-resize":
                                    newWidth = oldWidth + options.fix;
                                    $(ele).css({
                                        height: newHeight + "px"
                                    });
                                    break;
                            }
                        }
                    });
                    $(document).mouseup(function(e) {
                        e = e || window.event;
                        e.preventDefault();
                        e.stopPropagation();
                        $(document).off('mousemove');
                        $(document).off('mouseup');
                        if(!downAndMove) return false;
                        sizeInfo.width = newWidth;
                        sizeInfo.height = newHeight;
                        if(typeof doneFunc == 'function') doneFunc.call(this, sizeInfo);
                        return false;
                    });
                });
            }

            var rollbackHelper = {
                undoStack: [],     //“撤销操作”栈。
                redoStack: [],     //“重做操作”栈。
                isUndo: 0,         //事务操作标志位，内部调用
                //为了节省浏览器内存空间,undo/redo中的操作缓存栈,最多只可放40步操作;超过40步时,将自动删掉最旧的一个缓存
                pushOper: function(funcName, paras) {
                    if (this.isUndo == 1) {
                        this.redoStack.push([funcName, paras]);
                        this.isUndo = 0;
                        if (this.redoStack.length > 40) this.redoStack.shift();
                    } else {
                        this.undoStack.push([funcName, paras]);
                        if (this.undoStack.length > 40) this.undoStack.shift();
                        if (this.isUndo == 0) {
                            this.redoStack.splice(0, this.redoStack.length);
                        }
                        this.isUndo = 0;
                    }
                    this.changed.call(this);
                },
                //将外部的方法加入到JHWorkFlow对象的事务操作堆栈中,在过后的undo/redo操作中可以进行控制，一般用于对流程图以外的附加信息进行编辑的事务撤销/重做控制；
                //传参func为要执行方法对象,jsonPara为外部方法仅有的一个面向字面的JSON传参,由JSON对象带入所有要传的信息；
                //提示:为了让外部方法能够被UNDO/REDO,需要在编写这些外部方法实现时,加入对该方法执行后效果回退的另一个执行方法的pushExternalOper
                pushExternalOper: function(func, jsonPara) {
                    this.pushOper("externalFunc", [func, jsonPara]);
                },
                //撤销上一步操作
                undo: function() {
                    if (this.undoStack.length == 0) return;
                    var tmp = this.undoStack.pop();
                    this.isUndo = 1;
                    if (tmp[0] == "externalFunc") {
                        var func = tmp[1][0];
                        func.apply(this, tmp[1][1]);
                    } else {
                        eval('var func = '+tmp[0]+';');
                        func.apply(this, tmp[1]);
                    }
                },
                //重做最近一次被撤销的操作
                redo: function() {
                    if (this.redoStack.length == 0) return;
                    var tmp = this.redoStack.pop();
                    this.isUndo = 2;
                    if (tmp[0] == "externalFunc") {
                        var func = tmp[1][0];
                        func.apply(this, tmp[1][1]);
                    } else {
                        eval('var func = '+tmp[0]+';');
                        func.apply(this, tmp[1]);
                    }
                },
                getUndoStackLength: function() {
                    return this.undoStack.length;
                },
                getRedoStackLength: function() {
                    return this.redoStack.length;
                },
                changed: function() {

                },
                reset: function() {
                    this.undoStack = [];
                    this.redoStack = [];
                    this.isUndo = 0;
                }
            }

            instance.Node = NodeInstance;
            instance.Line = LineInstance;
            instance.Area = AreaInstance;

            return instance;
        }
    };

})(jQuery);