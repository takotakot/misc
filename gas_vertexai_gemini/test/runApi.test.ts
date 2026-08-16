import {runGeminiAPI} from '../src/runApi';
import {callVertexAiGenerateContent} from '../src/vertexai';

describe('Vertex AI & Gemini API', () => {
  const originalPropertiesService = (
    global as unknown as Record<string, unknown>
  ).PropertiesService;
  const originalVertexAI = (global as unknown as Record<string, unknown>)
    .VertexAI;
  const originalSpreadsheetApp = (global as unknown as Record<string, unknown>)
    .SpreadsheetApp;

  afterEach(() => {
    (global as unknown as Record<string, unknown>).PropertiesService =
      originalPropertiesService;
    (global as unknown as Record<string, unknown>).VertexAI = originalVertexAI;
    (global as unknown as Record<string, unknown>).SpreadsheetApp =
      originalSpreadsheetApp;
    jest.restoreAllMocks();
  });

  describe('callVertexAI', () => {
    it('calls Vertex AI Endpoint with properties from ScriptProperties', () => {
      const mockGetProperty = jest.fn((key: string) => {
        if (key === 'PROJECT_ID') return 'test-project';
        if (key === 'REGION') return 'asia-northeast1';
        if (key === 'MODEL_NAME') return 'gemini-2.5-flash';
        return null;
      });

      (global as unknown as Record<string, unknown>).PropertiesService = {
        getScriptProperties: () => ({
          getProperty: mockGetProperty,
        }),
      };

      const mockGenerateContent = jest.fn().mockReturnValue({
        candidates: [
          {
            content: {
              parts: [{text: 'Mocked Gemini response'}],
            },
          },
        ],
      });

      (global as unknown as Record<string, unknown>).VertexAI = {
        Endpoints: {
          generateContent: mockGenerateContent,
        },
      };

      const result = callVertexAiGenerateContent('Hello Gemini');

      expect(result).toBe('Mocked Gemini response');
      expect(mockGenerateContent).toHaveBeenCalledWith(
        {
          contents: [
            {
              role: 'user',
              parts: [{text: 'Hello Gemini'}],
            },
          ],
        },
        'projects/test-project/locations/asia-northeast1/publishers/google/models/gemini-2.5-flash',
      );
    });

    it('throws error when PROJECT_ID is not configured', () => {
      (global as unknown as Record<string, unknown>).PropertiesService = {
        getScriptProperties: () => ({
          getProperty: () => null,
        }),
      };

      expect(() => callVertexAiGenerateContent('Hello')).toThrow(
        'Project ID is not configured in Script Properties.',
      );
    });
  });

  describe('runGeminiAPI', () => {
    it('reads A2 and A3 cells and writes response to B2 and B3 cells', () => {
      const mockGetProperty = jest.fn((key: string) => {
        if (key === 'PROJECT_ID') return 'test-project';
        return null;
      });

      (global as unknown as Record<string, unknown>).PropertiesService = {
        getScriptProperties: () => ({
          getProperty: mockGetProperty,
        }),
      };

      const mockGenerateContent = jest
        .fn()
        .mockImplementation(
          (payload: {contents: Array<{parts: Array<{text: string}>}>}) => ({
            candidates: [
              {
                content: {
                  parts: [
                    {text: `Answer for: ${payload.contents[0].parts[0].text}`},
                  ],
                },
              },
            ],
          }),
        );

      (global as unknown as Record<string, unknown>).VertexAI = {
        Endpoints: {
          generateContent: mockGenerateContent,
        },
      };

      const rangeA2 = {getValue: jest.fn().mockReturnValue('Prompt 1')};
      const rangeA3 = {getValue: jest.fn().mockReturnValue('Prompt 2')};
      const rangeB2 = {setValue: jest.fn()};
      const rangeB3 = {setValue: jest.fn()};

      const mockSheet = {
        getRange: jest.fn((a1Notation: string) => {
          if (a1Notation === 'A2') return rangeA2;
          if (a1Notation === 'A3') return rangeA3;
          if (a1Notation === 'B2') return rangeB2;
          if (a1Notation === 'B3') return rangeB3;
          return null;
        }),
      };

      (global as unknown as Record<string, unknown>).SpreadsheetApp = {
        getActiveSheet: jest.fn().mockReturnValue(mockSheet),
      };

      runGeminiAPI();

      expect(rangeA2.getValue).toHaveBeenCalled();
      expect(rangeA3.getValue).toHaveBeenCalled();
      expect(rangeB2.setValue).toHaveBeenCalledWith('Answer for: Prompt 1');
      expect(rangeB3.setValue).toHaveBeenCalledWith('Answer for: Prompt 2');
    });

    it('logs error when Vertex AI call fails', () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (global as unknown as Record<string, unknown>).PropertiesService = {
        getScriptProperties: () => ({
          getProperty: () => null,
        }),
      };

      const rangeA2 = {getValue: jest.fn().mockReturnValue('Prompt 1')};
      const rangeA3 = {getValue: jest.fn().mockReturnValue('')};
      const rangeB2 = {setValue: jest.fn()};
      const rangeB3 = {setValue: jest.fn()};

      const mockSheet = {
        getRange: jest.fn((a1Notation: string) => {
          if (a1Notation === 'A2') return rangeA2;
          if (a1Notation === 'A3') return rangeA3;
          if (a1Notation === 'B2') return rangeB2;
          if (a1Notation === 'B3') return rangeB3;
          return null;
        }),
      };

      (global as unknown as Record<string, unknown>).SpreadsheetApp = {
        getActiveSheet: jest.fn().mockReturnValue(mockSheet),
      };

      expect(() => runGeminiAPI()).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to call Vertex AI: Project ID is not configured in Script Properties.',
      );
      expect(rangeB2.setValue).not.toHaveBeenCalled();
    });
  });
});
