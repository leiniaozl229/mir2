import layout from '../../../content/classic-176/ui-layout.json';
import {createNativeUiArtLoader} from './native-ui-art';

export const loadNativeSkillArt=createNativeUiArtLoader(layout.nationalCharacterWindow.skillRows.art,'prguse','技能标签');
