/**
 * Vertex AI Advanced Service の型定義
 * @see https://developers.google.com/apps-script/advanced/vertex-ai
 */
declare namespace GoogleAppsScript {
  namespace VertexAI {
    namespace Collection {
      interface EndpointsCollection {
        generateContent(
          resource: Schema.GenerateContentRequest,
          endpoint: string,
        ): Schema.GenerateContentResponse;
      }
    }
    namespace Schema {
      interface GenerateContentRequest {
        contents?: Content[];
      }
      interface Content {
        role?: string;
        parts?: Part[];
      }
      interface Part {
        text?: string;
      }
      interface GenerateContentResponse {
        candidates?: Candidate[];
      }
      interface Candidate {
        content?: Content;
      }
    }
  }
}

declare const VertexAI: {
  Endpoints: GoogleAppsScript.VertexAI.Collection.EndpointsCollection;
};
