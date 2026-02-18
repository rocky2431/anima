import type { EmotionState, ProactiveResponse, TriggerResult } from './types'

/**
 * Template-based response messages keyed by trigger name and emotion state.
 */
const RESPONSE_TEMPLATES: Record<string, Partial<Record<EmotionState, string>>> = {
  'morning-greeting': {
    excited: '早上好呀！新的一天开始了，今天也要加油哦～',
    idle: '早安。新的一天开始了。',
    curious: '早上好！昨晚睡得怎么样？今天有什么计划吗？',
    caring: '早上好～记得吃早餐哦！',
    worried: '早上好...昨晚没熬太晚吧？',
    sleepy: '早上好...嗯，我也还有点困呢...',
  },
  'noon-care': {
    caring: '已经中午了，你工作了好久呢。去吃午饭吧，别饿着～',
    idle: '午饭时间到了，记得去吃饭。',
    curious: '中午啦！今天想吃什么好呢？',
    worried: '都中午了还在工作...先去吃饭吧，身体要紧。',
    excited: '午饭时间！今天吃点好的犒劳一下自己吧～',
    sleepy: '中午了...吃完饭可以小睡一会儿哦。',
  },
  'rest-reminder': {
    caring: '工作了好久了，休息一下吧～ 站起来活动活动身体？',
    idle: '已经连续工作超过两小时了，建议休息一下。',
    curious: '哇，你好专注！不过也该休息一下啦，去喝杯水吧～',
    worried: '你已经连续工作很久了呢...要不要先休息一会儿？我有点担心你。',
    excited: '嘿嘿，工作狂！是时候给自己放个小假啦～',
    sleepy: '工作辛苦了...休息一下好吗？',
  },
  'entertainment-switch': {
    curious: '哦？切换到休闲模式了？今天工作辛苦啦～',
    idle: '看来是休息时间了。',
    caring: '辛苦工作之后放松一下也不错呢～',
    excited: '诶嘿，要开始玩了吗！开心～',
    worried: '要去放松一下吗？记得别玩太久哦。',
    sleepy: '啊，要去放松了...我也想休息一下...',
  },
  'late-night-work': {
    worried: '已经很晚了还在工作...要注意身体啊，早点休息吧。',
    idle: '已经很晚了，建议早点休息。',
    caring: '深夜了呢...辛苦了，今天的事情明天再做也可以的。',
    curious: '这么晚了还在忙什么呀？',
    excited: '夜深了！虽然状态不错，但也要注意休息哦～',
    sleepy: '好晚了...我都困了...你也去睡吧...',
  },
  'evening-summary': {
    caring: '今天辛苦了～要不要回顾一下今天做了些什么？',
    idle: '今天的工作差不多结束了，来看看今天的总结吧。',
    curious: '今天过得怎么样？我帮你整理一下今天的活动吧～',
    excited: '今天好充实呢！来看看都完成了什么吧！',
    worried: '今天似乎挺忙的...来看看进展如何？',
    sleepy: '今天就到这里吧...来看看今天的回顾。',
  },
  'important-date': {
    excited: '今天是个特别的日子呢！你还记得吗？',
    idle: '提醒一下，今天是一个重要的日子。',
    caring: '今天是个值得纪念的日子哦～',
    curious: '诶，今天好像是什么特别的日子？',
    worried: '差点忘了提醒你，今天是个重要的日子！',
    sleepy: '嗯...虽然有点困，但要提醒你，今天是个特别的日子。',
  },
  'task-due': {
    caring: '有一些待办事项快到期了哦，需要关注一下～',
    idle: '提醒：有任务即将到期。',
    curious: '你的待办列表里有些事情快到期了，需要看看吗？',
    worried: '有任务快到截止时间了...要赶紧处理一下吗？',
    excited: '加油！还有几个任务等着你完成呢！',
    sleepy: '嗯...有个任务快到期了，提醒一下。',
  },
  'high-frequency-switch': {
    worried: '你切换窗口好频繁...是不是遇到什么困难了？需要帮忙吗？',
    idle: '检测到频繁的窗口切换，是否需要帮助整理思路？',
    caring: '看起来你在好多东西之间切换呢，要不要停下来理清一下思路？',
    curious: '哇，你在好几个东西之间来回切换耶，在找什么吗？',
    excited: '你好忙的样子！是不是在做什么有趣的事情？',
    sleepy: '切换了好多窗口...是不是有点累了？',
  },
  'big-task-complete': {
    excited: '你刚才专注了好久呢！是不是完成了什么大任务？太棒了！',
    idle: '一段长时间的专注工作结束了，做得不错。',
    caring: '辛苦了～专注了这么久，成果一定很棒！',
    curious: '哇，你刚才超级专注的！完成了什么了不起的事情吗？',
    worried: '终于忙完了...辛苦了，好好休息一下吧。',
    sleepy: '忙了好久终于结束了...辛苦了。',
  },
  'return-to-desktop': {
    excited: '你回来啦！欢迎回来～',
    idle: '欢迎回来。',
    caring: '回来了呀～刚才去做什么了？',
    curious: '哦，你回来了！出去了一会儿呢，去干嘛了？',
    worried: '你回来了，之前离开了好一会儿，没事吧？',
    sleepy: '嗯...你回来了呀。',
  },
}

const DEFAULT_MESSAGE = '有什么需要帮忙的吗？'

/**
 * Generate a proactive persona response based on trigger and emotion.
 * Uses template-based generation. No LLM dependency required.
 *
 * @param trigger - The trigger result that caused this response (must be triggered)
 * @param emotion - Current emotion state
 * @returns A persona-driven proactive response
 */
export function generateResponse(
  trigger: Extract<TriggerResult, { triggered: true }>,
  emotion: EmotionState,
): ProactiveResponse {
  const templates = RESPONSE_TEMPLATES[trigger.triggerName]
  const message = templates?.[emotion] ?? templates?.idle ?? DEFAULT_MESSAGE

  return {
    message,
    emotion,
    triggerId: trigger.triggerId,
  }
}
