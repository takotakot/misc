/**
 * Gemini Enterprise Agent Platform API の Gemini モデルを利用する
 *
 * see: https://developers.google.com/apps-script/advanced/vertex-ai
 * @param prompt - モデルに渡すプロンプト
 * @returns Gemini のレスポンス
 */
export function callVertexAiGenerateContent(prompt: string): string {
  const scriptProperties = PropertiesService.getScriptProperties();
  const projectId =
    scriptProperties.getProperty('PROJECT_ID') ??
    scriptProperties.getProperty('projectId') ??
    '';
  const region =
    scriptProperties.getProperty('REGION') ??
    scriptProperties.getProperty('region') ??
    'global';
  const modelName =
    scriptProperties.getProperty('MODEL_NAME') ??
    scriptProperties.getProperty('modelName') ??
    'gemini-3.7-flash';

  if (!projectId) {
    throw new Error('Project ID is not configured in Script Properties.');
  }

  const model = `projects/${projectId}/locations/${region}/publishers/google/models/${modelName}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  /*
  GAS コードの自動補完には以下が表示される:

(method) Aiplatform_v1.Aiplatform.V1.Collection.EndpointsCollection.generateContent(resource: Aiplatform_v1.Aiplatform.V1.Schema.GoogleCloudAiplatformV1GenerateContentRequest, model: string): Aiplatform_v1.Aiplatform.V1.Schema.GoogleCloudAiplatformV1GenerateContentResponse (+1 overload)

Generate content with multimodal inputs.

@parammodel — Required. The fully qualified name of the publisher model or tuned model endpoint to use. Publisher model format: projects/{project}/locations/{location}/publishers/*\/models/* Tuned model endpoint format: projects/{project}/locations/{location}/endpoints/{endpoint}

generateContent(resource: Aiplatform_v1.Aiplatform.V1.Schema.GoogleCloudAiplatformV1GenerateContentRequest, model: string, optionalArgs: Object, headers: Object): Aiplatform_v1.Aiplatform.V1.Schema.GoogleCloudAiplatformV1GenerateContentResponse

Generate content with multimodal inputs.

同等のデータを公開ドキュメントで得たかったが、見つけることができなかった
https://docs.cloud.google.com/workflows/docs/reference/googleapis/aiplatform/v1/projects.locations.endpoints/generateContent
https://docs.cloud.google.com/nodejs/docs/reference/aiplatform/latest/aiplatform/v1.predictionserviceclient#_google_cloud_aiplatform_v1_PredictionServiceClient_generateContent_member_1_


  */
  const response = VertexAI.Endpoints.generateContent(payload, model);

  return (
    response?.candidates?.[0]?.content?.parts?.[0]?.text ??
    'No response from Gemini API'
  );
}

// TODO: Interactions API の呼び出しを追加する
