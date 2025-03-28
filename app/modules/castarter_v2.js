
const BaseModule = require('./baseModule');

class castarter_v2 extends BaseModule {
    // 클래스 내부에서 사용될 필드들을 이곳에서 선언합니다.
    constructor() {
        super();
        this.sp = null;
        this.sensorTypes = {
            ALIVE: 0,
            DIGITAL: 1,
            ANALOG: 2,
            PWM: 3,
            SERVO_PIN: 4,
            TONE: 5,
            PULSEIN: 6,
            ULTRASONIC: 7,
            TIMER: 8,
            SW_RESET: 9,
            RGBLED: 10,
            NEOPIXELINIT: 11,
            NEOPIXELDIS: 12,
            SERVO_DETACH: 13,
            LCDINIT: 14,
            LCD_DIS: 15,
            LCDCLEAR: 16,
            LCDOPTION: 17,
            DHTINIT: 25,
            DHTTEMP: 26,
            DHTHUMI: 27,
        };
        this.actionTypes = {
            GET: 1,
            SET: 2,
            RESET: 3,
        };
        this.sensorValueSize = {
            FLOAT: 2,
            SHORT: 3,
            STRING: 4,
        };
        this.digitalPortTimeList = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.sensorData = {
            ULTRASONIC: 0,
            DHTTEMP: 0,
            DHTHUMI: 0,
            PMVALUE: 0,
            DIGITAL: {
                '0': 0,
                '1': 0,
                '2': 0,
                '3': 0,
                '4': 0,
                '5': 0,
                '6': 0,
                '7': 0,
                '8': 0,
                '9': 0,
                '10': 0,
                '11': 0,
                '12': 0,
                '13': 0,
                '14': 0,
                '15': 0,
                '16': 0,
                '17': 0,
                '18': 0,
                '19': 0,
                '20': 0,
            },
            ANALOG: {
                '0': 0,
                '1': 0,
                '2': 0,
                '3': 0,
                '4': 0,
                '5': 0,
            },
            PULSEIN: {},
            TIMER: 0,
        };
        this.defaultOutput = {};
        this.recentCheckData = {};
        this.sendBuffers = [];
        this.lastTime = 0;
        this.lastSendTime = 0;
        this.isDraing = false;
        this.sensorIdx = 0;
    };
    init(handler, config) {
        this.handler = handler;
        this.config = config;
    }
    setSerialPort = function(sp) {
        const self = this;
        this.sp = sp;
    };
    requestInitialData = function() {
        return this.makeSensorReadBuffer(this.sensorTypes.ANALOG, 0);
    };
    checkInitialData = function(data, config) {
        return true;
        // 이후에 체크 로직 개선되면 처리
        // var datas = this.getDataByBuffer(data);
        // var isValidData = datas.some(function (data) {
        //     return (data.length > 4 && data[0] === 255 && data[1] === 85);
        // });
        // return isValidData;
    };
    afterConnect = function(that, cb) {
        that.connected = true;
        if (cb) {
            cb('connected');
        }
    };
    validateLocalData = function(data) {
        return true;
    };
    requestRemoteData = function(handler) {
        const self = this;
        if (!self.sensorData) {
            return;
        }
        Object.keys(this.sensorData).forEach((key) => {
            if (self.sensorData[key] != undefined) {
                handler.write(key, self.sensorData[key]);
            }
        });
    };
    handleRemoteData = function(handler) {
        const self = this;
        const getDatas = handler.read('GET');
        const setDatas = handler.read('SET') || this.defaultOutput;
        const time = handler.read('TIME');
        let buffer = new Buffer([]);
        if (getDatas) {
            const keys = Object.keys(getDatas);
            keys.forEach((key) => {
                let isSend = false;
                const dataObj = getDatas[key];
                if (typeof dataObj.port === 'string' || typeof dataObj.port === 'number') {
                    const time = self.digitalPortTimeList[dataObj.port];
                    if (dataObj.time > time) {
                        isSend = true;
                        self.digitalPortTimeList[dataObj.port] = dataObj.time;
                    }
                } else if (Array.isArray(dataObj.port)) {
                    isSend = dataObj.port.every((port) => {
                        const time = self.digitalPortTimeList[port];
                        return dataObj.time > time;
                    });

                    if (isSend) {
                        dataObj.port.forEach((port) => {
                            self.digitalPortTimeList[port] = dataObj.time;
                        });
                    }
                }
                if (isSend) {
                    if (!self.isRecentData(dataObj.port, key, dataObj.data)) {
                        self.recentCheckData[dataObj.port] = {
                            type: key,
                            data: dataObj.data,
                        };
                        buffer = Buffer.concat([buffer, self.makeSensorReadBuffer(key, dataObj.port, dataObj.data)]);
                    }
                }
            });
        }
        if (setDatas) {
            const setKeys = Object.keys(setDatas);
            setKeys.forEach((port) => {
                const data = setDatas[port];
                if (data) {
                    if (self.digitalPortTimeList[port] < data.time) {
                        self.digitalPortTimeList[port] = data.time;

                        if (!self.isRecentData(port, data.type, data.data)) {
                            self.recentCheckData[port] = {
                                type: data.type,
                                data: data.data,
                            };
                            buffer = Buffer.concat([buffer, self.makeOutputBuffer(data.type, port, data.data)]);
                        }
                    }
                }
            });
        }
        if (buffer.length) {
            this.sendBuffers.push(buffer);
        }
    };
    isRecentData = function(port, type, data) {
        const that = this;
        let isRecent = false;
        if (type == this.sensorTypes.ULTRASONIC) {
            const portString = port.toString();
            let isGarbageClear = false;
            Object.keys(this.recentCheckData).forEach((key) => {
                const recent = that.recentCheckData[key];
                if (key === portString) {
                }
                if (key !== portString && 
                    (recent.type == that.sensorTypes.ULTRASONIC || 
                        recent.type == that.sensorTypes.DHTTEMP || 
                        recent.type == this.sensorTypes.DHTHUMI)) {
                    delete that.recentCheckData[key];
                    isGarbageClear = true;
                }
            });
            if ((port in this.recentCheckData && isGarbageClear) || !(port in this.recentCheckData)) {
                isRecent = false;
            } else {
                isRecent = true;
            }
        } else if (port in this.recentCheckData && type == this.sensorTypes.TONE) { 
            if (
                this.recentCheckData[port].type === type &&
                this.recentCheckData[port].data === data
            ) {
                isRecent = true;
            }
        }
        return isRecent;
    };
    requestLocalData = function() {
        const self = this;

        if (!this.isDraing && this.sendBuffers.length > 0) {
            this.isDraing = true;
            this.sp.write(this.sendBuffers.shift(), () => {
                if (self.sp) {
                    self.sp.drain(() => {
                        self.isDraing = false;
                    });
                }
            });
        }
    };
    handleLocalData = function(data) {
        const self = this;
        const datas = this.getDataByBuffer(data);

        datas.forEach((data) => {
            if (data.length <= 4 || data[0] !== 255 || data[1] !== 85) {
                return;
            }
            const readData = data.subarray(2, data.length);
            let value;
            switch (readData[0]) {
                case self.sensorValueSize.FLOAT: {
                    value = new Buffer(readData.subarray(1, 5)).readFloatLE();
                    value = Math.round(value * 100) / 100;
                    break;
                }
                case self.sensorValueSize.SHORT: {
                    value = new Buffer(readData.subarray(1, 3)).readInt16LE();
                    break;
                }
                case self.sensorValueSize.STRING: {
                    value = new Buffer(readData[1] + 3);
                    value = readData.slice(2, readData[1] + 3);
                    value = value.toString('ascii', 0, value.length);
                    break;
                }
                default: {
                    value = 0;
                    break;
                }
            }
            const type = readData[readData.length - 1];
            const port = readData[readData.length - 2];
            switch (type) {
                case self.sensorTypes.DIGITAL: {
                    self.sensorData.DIGITAL[port] = value;
                    break;
                }
                case self.sensorTypes.ANALOG: {
                    self.sensorData.ANALOG[port] = value;
                    break;
                }
                case self.sensorTypes.PULSEIN: {
                    self.sensorData.PULSEIN[port] = value;
                    break;
                }
                case self.sensorTypes.ULTRASONIC: {
                    self.sensorData.ULTRASONIC = value;
                    break;
                }
                case self.sensorTypes.DHTTEMP: {
                    self.sensorData.DHTTEMP = value;
                    break;
                }
                case self.sensorTypes.DHTHUMI: {
                    self.sensorData.DHTHUMI = value;
                    break;
                }
                case self.sensorTypes.TIMER: {
                    self.sensorData.TIMER = value;
                    break;
                }
                default: {
                    break;
                }
            }
        });
    };
    makeSensorReadBuffer = function(device, port, data) {
        let buffer;
        const dummy = new Buffer([10]);
        if (device == this.sensorTypes.ULTRASONIC) {
            buffer = new Buffer([
                255,
                85,
                6,
                this.sensorIdx,
                this.actionTypes.GET,
                device,
                port[0],
                port[1],
                10,
            ]);
        } else if (device == this.sensorTypes.DHTTEMP || device == this.sensorTypes.DHTHUMI) {
            buffer = new Buffer([
                255,
                85,
                6, 
                this.sensorIdx,
                this.actionTypes.GET,
                device,
                port,
                10,
            ]);
        }  else if (!data) {
            buffer = new Buffer([
                255,
                85,
                5,
                this.sensorIdx,
                this.actionTypes.GET,
                device,
                port,
                10,
            ]);
        } else {
            const value = new Buffer(2);
            value.writeInt16LE(data);
            buffer = new Buffer([
                255,
                85,
                7,
                this.sensorIdx,
                this.actionTypes.GET,
                device,
                port,
                10,
            ]);
            buffer = Buffer.concat([buffer, value, dummy]);
        }
        this.sensorIdx++;
        if (this.sensorIdx > 254) {
            this.sensorIdx = 0;
        }
        return buffer;
    };
    makeOutputBuffer = function(device, port, data) {
        let buffer;
        const value = new Buffer(2);
        const dummy = new Buffer([10]);
        
        switch (device) {
            case this.sensorTypes.SERVO_PIN:
            case this.sensorTypes.DIGITAL:
            case this.sensorTypes.PWM: {
                value.writeInt16LE(data);
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);           
                break;
            }
            case this.sensorTypes.SERVO_DETACH: {
                value.writeInt16LE(data);
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);
                break;
            }
            case this.sensorTypes.TONE: {
                const time = new Buffer(2);
                if ($.isPlainObject(data)) {
                    value.writeInt16LE(data.value);
                    time.writeInt16LE(data.duration);
                } else {
                    value.writeInt16LE(0);
                    time.writeInt16LE(0);
                }
                buffer = new Buffer([
                    255,
                    85,
                    8,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, time, dummy]);
                break;
            }
            case this.sensorTypes.SW_RESET: {
                value.writeInt16LE(data);
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);
                break;
            }
            case this.sensorTypes.RGBLED: {
                value.writeInt16LE(data);
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);
                break;
            }
            case this.sensorTypes.NEOPIXELINIT: {
                value.writeInt16LE(data);
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);
                break;
            }
            case this.sensorTypes.NEOPIXELDIS: {
                const num = new Buffer(2);
                const r = new Buffer(2);
                const g = new Buffer(2);
                const b = new Buffer(2);
                
                if ($.isPlainObject(data)) {
                    num.writeInt16LE(data.num);
                    r.writeInt16LE(data.r);
                    g.writeInt16LE(data.g);
                    b.writeInt16LE(data.b);
                } else {
                    num.writeInt16LE(0);
                    r.writeInt16LE(0);
                    g.writeInt16LE(0);
                    b.writeInt16LE(0);
                }
                buffer = new Buffer([
                    255,
                    85,
                    12,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, num, r, g, b, dummy]);
                break;
            }
            case this.sensorTypes.DHTINIT:  {
                value.writeInt16LE(data);
                
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);
                break;
            }
            case this.sensorTypes.LCDINIT:  {
                value.writeInt16LE(data);
                
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);
                break;
            }
            case this.sensorTypes.LCD_DIS:  {  
                let text;
                const row = new Buffer(1);
                const column =  new Buffer(1);
                let textLen = 0;
                const textLenBuf =  new Buffer(1);
        
                if ($.isPlainObject(data)) {
                    textLen = (`${data.text}`).length;
                    text = Buffer.from(`${data.text}`, 'ascii');
                    row.writeInt8(data.row);
                    textLenBuf.writeInt8(textLen);
                    column.writeInt8(data.column);
                } else {
                    textLen = 0;
                    text = Buffer.from('', 'ascii');
                    row.writeInt8(0);
                    textLenBuf.writeInt8(textLen);
                    column.writeInt8(0);
                }
                buffer = new Buffer([
                    255,
                    85,
                    4 + 3 + textLen,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, row, column, textLenBuf, text, dummy]);
                break;
            }
            case this.sensorTypes.LCDOPTION: {  
                let text;
                const row = new Buffer(1);
                const column =  new Buffer(1);
                let textLen = 0;
                const textLenBuf =  new Buffer(1);
        
                if ($.isPlainObject(data)) {
                    textLen = (`${data.text}`).length;
                    text = Buffer.from(`${data.text}`, 'ascii');
                    row.writeInt8(data.row);
                    textLenBuf.writeInt8(textLen);
                    column.writeInt8(data.column);
                } else {
                    textLen = 0;
                    text = Buffer.from('', 'ascii');
                    row.writeInt8(0);
                    textLenBuf.writeInt8(textLen);
                    column.writeInt8(0);
                }
                buffer = new Buffer([
                    255,
                    85,
                    4 + 3 + textLen,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, row, column, textLenBuf, text, dummy]);
                break;
            }
            case this.sensorTypes.LCDCLEAR:  {
                value.writeInt16LE(data);	
                buffer = new Buffer([
                    255,
                    85,
                    6,
                    this.sensorIdx,
                    this.actionTypes.SET,
                    device,
                    port,
                ]);
                buffer = Buffer.concat([buffer, value, dummy]);  
                break;
            }
        }
        //console.log(buffer); 
        return buffer;
    };
    getDataByBuffer = function(buffer) {
        const datas = [];
        let lastIndex = 0;
        buffer.forEach((value, idx) => {
            if (value == 13 && buffer[idx + 1] == 10) {
                datas.push(buffer.subarray(lastIndex, idx));
                lastIndex = idx + 2;
            }
        });
        return datas;
    };
    disconnect = function(connect) {
        const self = this;
        connect.close();
        if (self.sp) {
            delete self.sp;
        }
    };
    reset = function() {
        this.lastTime = 0;
        this.lastSendTime = 0;
        this.sensorData.PULSEIN = {};
    };
}
module.exports = new castarter_v2();
