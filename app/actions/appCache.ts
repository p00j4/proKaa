export const UPDATE_PROTO_PATH = 'UPDATE_PROTO_PATH';

export function updateProtoPathsAction(updatedProtos: Record<string, any>[]) {
  return {
    type: UPDATE_PROTO_PATH,
    updatedProtos
  };
}