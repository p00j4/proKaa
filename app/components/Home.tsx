import React, { PureComponent } from 'react';
import { bindActionCreators, Dispatch } from 'redux';
import { connect } from 'react-redux';
import ReactJson from 'react-json-view';
import ClipLoader from 'react-spinners/ClipLoader';
import kafka from 'kafka-node';
import Protobuf from 'protobufjs';
import { v4 as uuidv4 } from 'uuid';

import styles from './Home.css';
import SideBar from './SideBar';

type State = {
  message: { type: 'string' | 'object'; content: string | Record<string, any> };
  host: string;
  topic: string;
  loading: boolean;
  error?: '';
  proto?: string;
  packageName?: string;
  messageName?: string;
};

type Props = { isProtoEnabled: boolean };

class Home extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      message: { type: 'string', content: '' },
      host: 'localhost:9092',
      topic: 'topic123',
      loading: false
    };
  }

  handleMessageChange = (event: { target: { value: string } }) => {
    this.setState({
      message: { type: 'string', content: event.target.value }
    });
  };

  onMessageEdit = edit => {
    this.setState({
      message: { type: 'object', content: edit.updated_src }
    });
  };

  handleHostChange = (host: { target: { value: string } }) => {
    this.setState({
      host: host.target.value
    });
  };

  handleTopicChange = (host: { target: { value: string } }) => {
    this.setState({
      topic: host.target.value
    });
  };

  sendMessage = async () => {
    const { isProtoEnabled } = this.props;
    this.setState({
      error: ''
    });
    const {
      host,
      message,
      messageName,
      topic,
      proto,
      packageName
    } = this.state;
    const { Producer } = kafka;
    const client = new kafka.KafkaClient({
      kafkaHost: host
    });
    const producer = new Producer(client);
    let payloads;
    if (!isProtoEnabled) {
      payloads = [{ topic, messages: message.content }];
    } else {
      const root: Record<string, any> = await Protobuf.load(proto);
      console.log(`${packageName}.${messageName}`);
      const protoMessage = root.lookupType(`${packageName}.${messageName}`);
      const errMsg = protoMessage.verify(message.content);
      if (errMsg) {
        console.log(errMsg);
        this.setState({
          error: errMsg
        });
        return;
      }
      const msg = protoMessage.create(message.content);
      const buffer = protoMessage.encodeDelimited(msg).finish();
      // console.log(buffer, protoMessage.decode(buffer));
      payloads = [{ topic, messages: buffer, key: uuidv4() }];
    }
    this.setState({
      loading: true
    });

    client.on('ready', function() {
      console.log('client ready', payloads);
    });

    client.on('error', function(err) {
      console.log(`client error: ${err}`);
    });
    console.log(payloads);
    producer.on('ready', () => {
      console.log('producer ready');
      producer.send(payloads, (err, data) => {
        this.setState({
          loading: false
        });
        console.log(err, data);
        producer.close();
        client.close();
      });
    });

    producer.on('error', err => {
      console.log(err);
      this.setState({
        loading: false,
        error: err
      });
    });
  };

  getCustomMessageMock = (
    fieldName: string,
    type: string,
    filepath: string,
    packageName: string
  ) => {
    const { protos } = this.props;
    const mock = {};
    Object.keys(protos).forEach(key => {
      if (protos[key].filepath === filepath) {
        console.log('found message in same filepath');
        if (type.includes('.')) {
          console.log('found message with another package');
          const split = type.split('.');
          const msgName = split.pop();
          const newPackageName = `${split.join('.')}`;
          Object.keys(protos[key].data[newPackageName].messages).forEach(k => {
            const msg = protos[key].data[newPackageName].messages[k];

            if (msg.name === msgName) {
              Object.keys(msg.fields).forEach(fi => {
                const mockValue = this.getValueOfType(
                  msg.fields[fi].type,
                  fi,
                  filepath,
                  newPackageName
                );
                console.log(fi, mockValue);
                if (msg.fields[fi].rule === 'repeated') {
                  mock[fi] = [mockValue];
                  if (msg.fields[fi].keyType) {
                    // map
                    const typeMock = this.getValueOfType(
                      msg.fields[fi].keyType,
                      fi,
                      filepath,
                      newPackageName
                    );
                    mock[fi] = {};
                    mock[fi][typeMock] = mockValue;
                  }
                } else {
                  mock[fi] = mockValue;
                  if (msg.fields[fi].keyType) {
                    // map
                    const typeMock = this.getValueOfType(
                      msg.fields[fi].keyType,
                      fi,
                      filepath,
                      newPackageName
                    );
                    mock[fi] = {};
                    mock[fi][typeMock] = mockValue;
                  }
                }
                // mock[fi] = subMock;
              });
              //     console.log(msgName, subMock);
            }
          });
        } else {
          Object.keys(protos[key].data[packageName].messages).forEach(k => {
            const msg = protos[key].data[packageName].messages[k];
            if (msg.name === type) {
              Object.keys(msg.fields).forEach(fi => {
                const mockValue = this.getValueOfType(
                  msg.fields[fi].type,
                  fi,
                  filepath,
                  packageName
                );
                if (msg.fields[fi].rule === 'repeated') {
                  mock[fi] = [mockValue];
                  if (msg.fields[fi].keyType) {
                    // map
                    const typeMock = this.getValueOfType(
                      msg.fields[fi].keyType,
                      fi,
                      filepath,
                      newPackageName
                    );
                    mock[fi] = {};
                    mock[fi][typeMock] = mockValue;
                  }
                } else {
                  mock[fi] = mockValue;
                  if (msg.fields[fi].keyType) {
                    // map
                    const typeMock = this.getValueOfType(
                      msg.fields[fi].keyType,
                      fi,
                      filepath,
                      newPackageName
                    );
                    mock[fi] = {};
                    mock[fi][typeMock] = mockValue;
                  }
                }
              });
            }
          });
        }
      }
    });
    return Object.keys(mock).length === 0 ? 0 : mock;
  };

  getValueOfType = (
    type: string,
    fieldName: string,
    filepath: string,
    packageName: string
  ) => {
    switch (type) {
      case 'string': {
        const fieldNameLower = fieldName.toLowerCase();

        if (fieldNameLower.startsWith('id') || fieldNameLower.endsWith('id')) {
          return uuidv4();
        }

        return 'Hello';
      }
      case 'number':
        return 10;
      case 'bool':
        return true;
      case 'int32':
        return 10;
      case 'int64':
        return 20;
      case 'uint32':
        return 100;
      case 'uint64':
        return 100;
      case 'sint32':
        return 100;
      case 'sint64':
        return 1200;
      case 'fixed32':
        return 1400;
      case 'fixed64':
        return 1500;
      case 'sfixed32':
        return 1600;
      case 'sfixed64':
        return 1700;
      case 'double':
        return 1.4;
      case 'float':
        return 1.1;
      case 'bytes':
        return Buffer.from('Hello');
      default: {
        const mock = this.getCustomMessageMock(
          fieldName,
          type,
          filepath,
          packageName
        );
        return Object.keys(mock) === 0 ? 0 : mock;
      }
    }
  };

  onMessageItemSelect = (msg: {
    name: string;
    fields: Record<string, any>;
    proto: string;
    packageName: string;
  }) => {
    this.setState({
      error: ''
    });
    const obj = {};
    console.log(msg);
    Object.keys(msg.fields).forEach(fieldName => {
      const mock = this.getValueOfType(
        msg.fields[fieldName].type,
        fieldName,
        msg.proto,
        msg.packageName
      );
      if (msg.fields[fieldName].rule === 'repeated') {
        obj[fieldName] = [mock];

        if (msg.fields[fieldName].keyType) {
          // map
          const typeMock = this.getValueOfType(
            msg.fields[fieldName].keyType,
            fieldName,
            msg.proto,
            msg.packageName
          );
          obj[fieldName] = {};
          obj[fieldName][typeMock] = mock;
        }
      } else {
        obj[fieldName] = mock;

        if (msg.fields[fieldName].keyType) {
          // map
          const typeMock = this.getValueOfType(
            msg.fields[fieldName].keyType,
            fieldName,
            msg.proto,
            msg.packageName
          );
          obj[fieldName] = {};
          obj[fieldName][typeMock] = mock;
        }
      }
    });
    console.log(JSON.stringify(obj, null, 2));
    this.setState({
      message: { type: 'object', content: obj },
      messageName: msg.name,
      proto: msg.proto,
      packageName: msg.packageName
    });
  };

  render() {
    const { host, message, topic, loading, error } = this.state;
    const { isProtoEnabled } = this.props;
    return (
      <div className={styles.container} data-tid="container">
        <div className={styles.sideBar}>
          <SideBar onMessageItemSelect={this.onMessageItemSelect} />
        </div>
        <div className={styles.rightPanel}>
          <span className={styles.inputRow}>
            <span className={styles.label}>Kafka Host:</span>
            <input
              value={host}
              className={styles.input}
              placeholder="localhost:9092"
              onChange={e => {
                this.handleHostChange(e);
              }}
            />
          </span>
          <span className={styles.inputRow}>
            <span className={styles.label}>Topic:</span>
            <input
              value={topic}
              className={styles.input}
              placeholder="topic"
              onChange={e => {
                this.handleTopicChange(e);
              }}
            />
          </span>
          <div className={styles.messageContainer}>
            {!isProtoEnabled ? (
              <textarea
                className={styles.messageInput}
                value={message.content}
                onChange={this.handleMessageChange}
              />
            ) : (
              <ReactJson
                theme="summerfruit:inverted"
                name={false}
                displayDataTypes={false}
                displayObjectSize={false}
                enableClipboard={false}
                src={{ ...message.content }}
                onEdit={this.onMessageEdit}
                onAdd={this.onMessageEdit}
              />
            )}
          </div>
          {error && (
            <div className={styles.errorWrapper}>{JSON.stringify(error)}</div>
          )}
          <button
            className={styles.pushButton}
            type="button"
            onClick={this.sendMessage}
          >
            {!loading && <span>Push</span>}
            <ClipLoader size={20} color="#ffffff" loading={loading} />
          </button>
        </div>
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    isProtoEnabled: state.appConfig.protoEnabled,
    protos: state.appCache.protos
  };
}

function mapDispatchToProps(dispatch: Dispatch) {
  return bindActionCreators({}, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(Home);
