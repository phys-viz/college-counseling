import type {TrendMetric} from './trend-types';

export type TrendSchool={school_id:string;school:string;index_url?:string;first_year?:number;last_year?:number};
export type TrendSettings={school:string;comparison:string;metric:TrendMetric;start:string;end:string;showLabels:boolean;axisMode:string;axisMin:string;axisMax:string};
export const defaultTrendSettings:TrendSettings={school:'cornell',comparison:'none',metric:'admit_rate',start:'2010',end:'2015',showLabels:true,axisMode:'auto',axisMin:'',axisMax:''};

/** A new school starts with its actual coverage; tab changes preserve settings. */
export function withTrendSchool(settings:TrendSettings,school:string,coverage?:TrendSchool):TrendSettings{
 const first=coverage?.first_year,last=coverage?.last_year;
 const hasRange=typeof first==='number'&&typeof last==='number'&&Number.isInteger(first)&&Number.isInteger(last)&&first>=1900&&last<=2100&&first<=last;
 return {...settings,school,comparison:settings.comparison===school?'none':settings.comparison,...(hasRange?{start:String(first),end:String(last)}:{})};
}
