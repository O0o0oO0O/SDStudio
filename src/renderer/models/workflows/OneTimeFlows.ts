import { backend, imageService, localAIService, taskQueueService, workFlowService } from "..";
import { AugmentMethod, Resolution, upscaleReoslution } from "../../backends/imageGen";
import { getImageDimensions } from "../../componenets/BrushTool";
import { appState } from "../AppService";
import { dataUriToBase64 } from "../ImageService";
import { queueI2IWorkflow, TaskParam } from "../TaskQueueService";
import { AugmentJob, GenericScene, SDAbstractJob, Session } from "../types";
import { emotions } from "./AugmentWorkFlow";
import { createI2IPreset } from "./SDWorkFlow";
import { PromptService } from "../PromptService";

export const queueRemoveBg = async (
  session: Session,
  scene: GenericScene,
  image: string,
  onComplete?: (path: string) => void,
  imgJob?: SDAbstractJob<string>,
) => {
  const config = await backend.getConfig();
  if (config.useLocalBgRemoval && !localAIService.ready) {
      appState.pushMessage(
      '환경설정에서 배경 제거 기능을 활성화해주세요',
    );
    return;
  }
  const job: AugmentJob = {
    type: 'augment',
    image: image,
    prompt: { type: 'text', text: '' },
    method: 'bg-removal',
    backend: {
      type: config.useLocalBgRemoval ? 'SD' : 'NAI'
    },
    width: 0,
    height: 0,
  };
  const params: TaskParam = {
    session,
    job,
    outputPath: imageService.getOutputDir(session, scene),
    scene,
    onComplete,
  };
  taskQueueService.addTask(params, 1);
};

const queueAugment = async (
  method: AugmentMethod,
  session: Session,
  scene: GenericScene,
  image: string,
  onComplete?: (path: string) => void,
  emotion?: string,
  prompt?: string,
  weaken?: number) => {
  const { width, height } = await getImageDimensions(image);
  const job: AugmentJob = {
    type: 'augment',
    image: image,
    emotion: emotion,
    prompt: { type: 'text', text: prompt ?? ''},
    method: method,
    weaken: weaken,
    backend: {
      type: 'NAI',
    },
    width: width,
    height: height,
  };
  const params: TaskParam = {
    session,
    job,
    outputPath: imageService.getOutputDir(session, scene),
    scene,
    onComplete,
  };
  const samples = appState.samples;
  taskQueueService.addTask(params, samples);
}

const createQueueAugment = (method: AugmentMethod) => {
  return async (
    session: Session,
    scene: GenericScene,
    image: string,
    onComplete?: (path: string) => void,
    imgJob?: SDAbstractJob<string>,
  ) => {
    await queueAugment(method, session, scene, image, onComplete);
  };
}

export const queueDeclutter = createQueueAugment('declutter');
export const queueSketch = createQueueAugment('sketch');
export const queueLineart = createQueueAugment('lineart');

const getColorizeInput = async (
  session: Session,
) => {
  const defry = await appState.pushDialogAsync({
    text: 'defry를 선택해주세요',
    type: 'dropdown',
    items: [0,1,2,3,4,5].map((x) => ({ text: x.toString(), value: x.toString() })),
  });
  if (defry == null) return null;

  const promptInput = await appState.pushDialogAsync({
    text: '프롬프트를 입력해주세요 (프롬프트 조각 <라이브러리.조각이름> 형식 사용 가능)',
    type: 'input-confirm',
  });
  if (promptInput == null) return null;
  
  // 프롬프트 조각 처리
  let finalPrompt = promptInput;
  
  try {
    // <...> 패턴이 있는지 확인
    const piecePattern = /<([^>]+)>/g;
    const matches = [...promptInput.matchAll(piecePattern)];
    
    if (matches.length > 0) {
      // 조각 패턴이 발견되면 PromptService 생성
      const promptService = new PromptService();
      
      // 각 조각마다 처리
      for (const match of matches) {
        const piece = match[0]; // 전체 매치 (예: <캐릭터.소녀>)
        const pieceName = match[1]; // 조각 이름 (예: 캐릭터.소녀)
        
        try {
          // 조각 확장
          const expandedPiece = promptService.tryExpandPiece(piece, session);
          // 원본 조각을 확장된 내용으로 대체
          finalPrompt = finalPrompt.replace(piece, expandedPiece);
        } catch (error) {
          // 특정 조각 처리 오류 시 사용자에게 알림
          appState.pushMessage(`조각 '${pieceName}' 처리 중 오류가 발생했어요: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        }
      }
    }
  } catch (error) {
    // 전체 처리 오류 시 원본 프롬프트 유지
    appState.pushMessage('프롬프트 조각 처리 중 오류가 발생했어요: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
  }
  
  return { prompt: finalPrompt, weaken: parseInt(defry) };
}

const queueColorize = async (
  session: Session,
  scene: GenericScene,
  image: string,
  onComplete?: (path: string) => void,
  imgJob?: SDAbstractJob<string>,
  input?: any,
) => {
  if (input == null) return;
  await queueAugment('colorize', session, scene, image, onComplete, undefined, input.prompt, input.weaken);
}

const getEmotionInput = async (
  session: Session,
) => {
  const emotion = await appState.pushDialogAsync({
    text: '감정을 선택해주세요',
    type: 'dropdown',
    items: emotions.map((x) => ({ text: x, value: x })),
  });
  if (emotion == null) return null;

  const defry = await appState.pushDialogAsync({
    text: 'defry를 선택해주세요',
    type: 'dropdown',
    items: [0,1,2,3,4,5].map((x) => ({ text: x.toString(), value: x.toString() })),
  });
  if (defry == null) return null;

  const promptInput = await appState.pushDialogAsync({
    text: '프롬프트를 입력해주세요 (프롬프트 조각 <라이브러리.조각이름> 형식 사용 가능)',
    type: 'input-confirm',
  });
  if (promptInput == null) return null;
  
  // 프롬프트 조각 처리 (위와 동일한 로직)
  let finalPrompt = promptInput;
  
  try {
    const piecePattern = /<([^>]+)>/g;
    const matches = [...promptInput.matchAll(piecePattern)];
    
    if (matches.length > 0) {
      const promptService = new PromptService();
      
      for (const match of matches) {
        const piece = match[0];
        const pieceName = match[1];
        
        try {
          const expandedPiece = promptService.tryExpandPiece(piece, session);
          finalPrompt = finalPrompt.replace(piece, expandedPiece);
        } catch (error) {
          appState.pushMessage(`조각 '${pieceName}' 처리 중 오류가 발생했어요: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        }
      }
    }
  } catch (error) {
    appState.pushMessage('프롬프트 조각 처리 중 오류가 발생했어요: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
  }
  
  return { emotion, prompt: finalPrompt, weaken: parseInt(defry) };
}

const queueEmotion = async (
  session: Session,
  scene: GenericScene,
  image: string,
  onComplete?: (path: string) => void,
  imgJob?: SDAbstractJob<string>,
  input?: any,
) => {
  if (input == null) return;
  await queueAugment('emotion', session, scene, image, onComplete, input.emotion, input.prompt, input.weaken);
}

const noiseTable = [
  { strength: 0.2, noise: 0 },
  { strength: 0.4, noise: 0 },
  { strength: 0.5, noise: 0 },
  { strength: 0.6, noise: 0 },
  { strength: 0.7, noise: 0.1 },
]

const getStrengthInput = async (
  session: Session,
) => {
  const menu = await appState.pushDialogAsync({
    text: '강도를 선택해주세요',
    type: 'select',
    items: [
      { text: '강도 1', value: '1'},
      { text: '강도 2', value: '2'},
      { text: '강도 3', value: '3'},
      { text: '강도 4', value: '4'},
      { text: '강도 5', value: '5'},
    ]
  });
  if (!menu) return null;
  const st = parseInt(menu);
  return noiseTable[st - 1];
}

export const queueI2I = async (
  session: Session,
  scene: GenericScene,
  image: string,
  onComplete?: (path: string) => void,
  imgJob?: SDAbstractJob<string>,
  input?: any,
) => {
  if (!input) return;
  const samples = appState.samples;
  const preset = imgJob ? createI2IPreset(imgJob, image) : workFlowService.buildPreset('SDI2I');
  preset.image = image;
  const { strength, noise } = input;
  preset.strength = strength;
  preset.noise = noise;
  await queueI2IWorkflow(session, 'SDI2I', preset, scene, samples, onComplete);
}

export const queueEnhance = async (
  session: Session,
  scene: GenericScene,
  image: string,
  onComplete?: (path: string) => void,
  imgJob?: SDAbstractJob<string>,
  input?: any,
) => {
  if (!input) return;
  const samples = appState.samples;
  const preset = imgJob ? createI2IPreset(imgJob, image) : workFlowService.buildPreset('SDI2I');
  preset.image = image;
  preset.smea = false;
  preset.dyn = false;
  const { strength, noise } = input;
  preset.strength = strength;
  preset.noise = noise;
  preset.overrideResolution = upscaleReoslution(scene.resolution as Resolution);
  await queueI2IWorkflow(session, 'SDI2I', preset, scene, samples, onComplete);
}

interface OneTimeFlowItem {
  text: string;
  handler: (session: Session, scene: GenericScene, image: string, onComplete?: (path: string) => void, imgJob?: SDAbstractJob<string>, input?: any) => void | Promise<void>;
  getInput?: (session: Session) => Promise<any>;
}

export const oneTimeFlows: OneTimeFlowItem[] = [
  { text: '배경제거', handler: queueRemoveBg },
  { text: '이미지 앤핸스', handler: queueEnhance, getInput: getStrengthInput },
  { text: '이미지 투 이미지', handler: queueI2I, getInput: getStrengthInput },
  { text: '컬러라이즈', handler: queueColorize, getInput: getColorizeInput },
  { text: '감정', handler: queueEmotion, getInput: getEmotionInput },
  { text: '글자제거', handler: queueDeclutter },
  { text: '스케치화', handler: queueSketch },
  { text: '라인아트화', handler: queueLineart },
];

export const oneTimeFlowMap = new Map<string, OneTimeFlowItem>(oneTimeFlows.map((item) => [item.text, item]));
