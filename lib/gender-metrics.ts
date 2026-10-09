export const genderCategories=[['male','Male'],['female','Female'],['another_gender','Another gender'],['unknown_gender','Unknown gender / sex']] as const;
export type GenderMetric=`${typeof genderCategories[number][0]}_${'applicants'|'admitted'|'enrolled'|'admit_rate'|'yield_rate'}`;
export const genderMetricKeys=genderCategories.flatMap(([id])=>(['applicants','admitted','enrolled','admit_rate','yield_rate'] as const).map(k=>`${id}_${k}` as GenderMetric));
export const isGenderMetric=(key:string):key is GenderMetric=>genderMetricKeys.includes(key as GenderMetric);
